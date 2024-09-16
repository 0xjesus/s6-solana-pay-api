import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, signerIdentity, percentAmount, none } from '@metaplex-foundation/umi';
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createTree, mintToCollectionV1 } from '@metaplex-foundation/mpl-bubblegum';
import { PublicKey, Transaction } from '@solana/web3.js';

// Inicializar cliente S3 para DigitalOcean Spaces
const s3 = new S3Client({
  endpoint: "https://nyc3.digitaloceanspaces.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
});

// Inicializar conexión a Solana
const umi = createUmi(process.env.SOLANA_RPC_URL);

class CompressedNFTAirdropService {
  static async uploadFile(file) {
    const bucketName = "blockchainstarter";
    const location = "uploads";
    const fileName = file.filename || `uploaded-image-${Date.now()}.jpg`;
    const key = `${location}/${fileName}`;

    const command = new PutObjectCommand({
      Key: key,
      Body: file.buffer,
      Bucket: bucketName,
      ACL: "public-read",
      ContentType: file.mimetype,
    });

    await s3.send(command);
    return `https://${bucketName}.nyc3.digitaloceanspaces.com/${key}`;
  }

  static async uploadMetadata(imageUrl) {
    const bucketName = "blockchainstarter";
    const location = "uploads";
    const metadata = {
      name: "Compressed NFT Airdrop",
      symbol: "CNFT",
      description: "Compressed NFT using Metaplex Bubblegum on Solana.",
      image: imageUrl,
      attributes: [{ trait_type: "Airdrop", value: "Compressed NFT" },
        // add a trait type of social media link
        { trait_type: "Social Media", value: "https://x.com/@_0xjesus" }
      ],
    };

    const metadataJson = JSON.stringify(metadata);
    const metadataBuffer = Buffer.from(metadataJson, 'utf-8');
    const metadataKey = `${location}/metadata-${Date.now()}.json`;

    const command = new PutObjectCommand({
      Key: metadataKey,
      Body: metadataBuffer,
      Bucket: bucketName,
      ACL: "public-read",
      ContentType: "application/json",
    });

    await s3.send(command);
    return `https://${bucketName}.nyc3.digitaloceanspaces.com/${metadataKey}`;
  }

  static async createMerkleTree() {
    const merkleTree = generateSigner(umi);

    // Crear el Merkle Tree y su configuración
    const builder = await createTree(umi, {
      merkleTree,
      maxDepth: 14,          // Permite hasta 16,384 NFTs
      maxBufferSize: 64,     // Configuración para la concurrencia
    });

    // Enviar y confirmar la creación del Merkle Tree
    await builder.sendAndConfirm(umi);
    return merkleTree.publicKey;
  }

  static async mintCompressedNFTsToWallets(fromPubKey, file, wallets, collectionMintPubKey) {
    try {
      // Subir imagen y metadata
      const imageUrl = await this.uploadFile(file);
      const metadataUrl = await this.uploadMetadata(imageUrl);

      // Configuración de signer
      umi.use(signerIdentity(generateSigner(umi)));

      // Crear un Merkle Tree (Bubblegum Tree) para los NFTs comprimidos
      const merkleTreeAddress = await this.createMerkleTree();

      // Iterar sobre cada wallet y mintear un NFT comprimido a la colección
      const instructions = [];

      for (const wallet of wallets) {
        // Crear la instrucción de minting a la colección
        const mintToCollectionIx = await mintToCollectionV1(umi, {
          leafOwner: wallet,
          merkleTree: merkleTreeAddress,
          collectionMint: new PublicKey(collectionMintPubKey),
          metadata: {
            name: 'Compressed NFT Airdrop',
            uri: metadataUrl,
            sellerFeeBasisPoints: 500, // 5%
            collection: { key: collectionMintPubKey, verified: false },
            creators: [
              { address: umi.identity.publicKey, verified: false, share: 100 },
            ],
          },
        });

        instructions.push(mintToCollectionIx);
      }

      // Crear la transacción y serializarla para devolverla como base64
      const { blockhash } = await umi.rpc.getLatestBlockhash();
      const transaction = new Transaction({ recentBlockhash: blockhash }).add(...instructions);
      transaction.feePayer = new PublicKey(fromPubKey);

      // Serializar la transacción sin firmar
      const serializedTransaction = umi.transactions.serialize(transaction);

      // Devolver la transacción codificada en base64
      return Buffer.from(serializedTransaction).toString('base64');
    } catch (error) {
      console.error("Error during compressed NFT airdrop:", error);
      throw new Error("Compressed NFT Airdrop failed.");
    }
  }
}

export default CompressedNFTAirdropService;
