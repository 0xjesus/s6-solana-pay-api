import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNoopSigner, generateSigner, signerIdentity, transactionBuilder, publicKey } from '@metaplex-foundation/umi';
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createTree, fetchMerkleTree, fetchTreeConfigFromSeeds, mintToCollectionV1, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import {Connection, Transaction} from "@solana/web3.js";
// Elimina la importación de TransactionBuilder desde @metaplex-foundation/js si no se utiliza

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
			attributes: [{trait_type: "Airdrop", value: "Compressed NFT"},
				// add a trait type of social media link
				{trait_type: "Social Media", value: "https://x.com/@_0xjesus"}
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

	static async createMerkleTree(fromPubKey) {
		umi.use(signerIdentity(createNoopSigner(fromPubKey)));
		const merkleTree = generateSigner(umi);
		console.log("MerkleTree Signer:", merkleTree);
		const builder = await createTree(umi, {
			merkleTree,
			maxDepth: 14,          // Permite hasta 16,384 NFTs
			maxBufferSize: 64,     // Configuración para la concurrencia
		});
		console.log("Builder object: ", builder);
		const builtTreeTransaction = await builder.buildWithLatestBlockhash(umi);
		console.log("Built Tree Transaction:", builtTreeTransaction);
		const signedTransaction = await merkleTree.signTransaction(builtTreeTransaction);
		console.log("Signature Merkle Tree:", signedTransaction);
		/// partially sign the transaction using merkleTree
		const serializedTx = umi.transactions.serialize(signedTransaction)
		console.log("Encoded Merkle Tree:", Buffer.from(serializedTx).toString('base64'));
		return Buffer.from(serializedTx).toString('base64');
	}

	static async mintCompressedNFTsToWallets(fromPubKey, wallets, collectionMintPubKey, merkleTreeAddress) {
		console.log("=== Iniciando mintCompressedNFTsToWallets ===");
		console.log("Parámetros recibidos:");
		console.log("fromPubKey:", fromPubKey);
		console.log("wallets:", wallets);
		console.log("collectionMintPubKey:", collectionMintPubKey);
		console.log("merkleTreeAddress:", merkleTreeAddress);

		try {
			// Opcional: subir el archivo y metadata si es necesario
			// const imageUrl = await this.uploadFile(file);
			// const metadataUrl = await this.uploadMetadata(imageUrl);
			const imageUrl = 'https://blockchainstarter.nyc3.digitaloceanspaces.com/uploads/uploaded-image-1726526965762.jpg';
			const metadataUrl = 'https://blockchainstarter.nyc3.digitaloceanspaces.com/uploads/metadata-1726526966269';
			console.log("Image URL:", imageUrl);
			console.log("Metadata URL:", metadataUrl);

			// Crear una nueva instancia de umi dentro del método para evitar acumulación de middlewares
			const umiInstance = createUmi(process.env.SOLANA_RPC_URL);
			console.log("Instancia de Umi creada.");
			umiInstance.use(signerIdentity(createNoopSigner(fromPubKey)));
			umiInstance.use(mplBubblegum());
			console.log("Middlewares agregados a Umi.");

			let newTxBuilder = transactionBuilder();
			console.log("Transaction builder inicializado.");

			// Fetch Merkle Tree
			console.log("Fetching Merkle Tree desde:", merkleTreeAddress);
			const merkleTreeAccount = await fetchMerkleTree(umiInstance, merkleTreeAddress);
			console.log("Merkle Tree Account:", merkleTreeAccount);

			// Fetch Tree Config
			console.log("Fetching Tree Config desde seeds.");
			const treeConfig = await fetchTreeConfigFromSeeds(umiInstance, {
				merkleTree: merkleTreeAddress,
				header: merkleTreeAccount.header
			});
			console.log("Tree Config:", treeConfig);

			console.log("Collection Mint PubKey:", collectionMintPubKey);
			console.log("Merkle Tree Address:", merkleTreeAddress);

			for (const wallet of wallets) {
				console.log("Procesando wallet:", wallet);
				// Crear la instrucción de minting a la colección
				const mintToCollectionIx = await mintToCollectionV1(umiInstance, {
					leafOwner: publicKey(wallet),
					merkleTree: publicKey(merkleTreeAddress),
					collectionMint: publicKey(collectionMintPubKey),
					metadata: {
						name: 'Compressed NFT Airdrop',
						uri: metadataUrl,
						sellerFeeBasisPoints: 500, // 5%
						collection: {key: publicKey(collectionMintPubKey), verified: true},
						collectionAuthority: umiInstance.identity.publicKey,
						creators: [
							{address: umiInstance.identity.publicKey, verified: true, share: 100},
						],
					},
				});
				console.log(`Instrucción creada para wallet: ${wallet}`);
				//console.log(" Mint to Collection Instruction:", mintToCollectionIx.getInstructions());
				newTxBuilder = newTxBuilder.add(mintToCollectionIx);
				console.log("Instrucción añadida al transaction builder.");
			}

			// await newTxBuilder.setFeePayer(fromPubKey);
			console.log("Construyendo la transacción con las instrucciones agregadas.");
			const transaction = await newTxBuilder.buildWithLatestBlockhash(umiInstance);
			console.log("Transacción construida:", transaction);

			const serializedTransaction = umiInstance.transactions.serialize(transaction);
			console.log("Transacción serializada:", serializedTransaction);

			const encodedTransaction = Buffer.from(serializedTransaction).toString('base64');
			console.log("Transacción encodificada (base64):", encodedTransaction);

			console.log("=== Fin de mintCompressedNFTsToWallets ===");
			return encodedTransaction;
		} catch (error) {
			console.error("Error durante el airdrop de NFT comprimidos:", error);
			throw new Error("Compressed NFT Airdrop failed.");
		}
	}
}
export default CompressedNFTAirdropService;
