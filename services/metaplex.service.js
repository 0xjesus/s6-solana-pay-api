import {createUmi} from '@metaplex-foundation/umi-bundle-defaults';
import {
	createCandyMachineV2,
	mplCandyMachine,
	addConfigLines, mintV2, fetchCandyMachine, findCandyGuardPda, createCandyGuard,
	wrap,
} from '@metaplex-foundation/mpl-candy-machine';

import {
	createNoopSigner,
	generateSigner,
	percentAmount,
	publicKey,
	signerIdentity,
	some
} from '@metaplex-foundation/umi';
import {
	createNft,
	TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata'
import {sol} from "@metaplex-foundation/js";
import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: "https://nyc3.digitaloceanspaces.com", // Cambia "nyc3" por tu región específica
  forcePathStyle: false,
  region: "us-east-1", // Esta región es requerida por el SDK, pero el endpoint define la ubicación real
  credentials: {
    accessKeyId: process.env.SPACES_KEY, // Tu clave de acceso
    secretAccessKey: process.env.SPACES_SECRET // Tu clave secreta
  }
});
const umi = createUmi(process.env.SOLANA_RPC_URL)

class MetaplexService {
	static async uploadFileAndCreateCollection(fromPubKey, file, latitude, longitude) {
		try {
		  // 1. Upload the image to DigitalOcean Spaces
		  const bucketName = "blockchainstarter";
		  const location = "uploads";
		  const imageKey = `${location}/${file.filename}`;

		  const imageUploadCommand = new PutObjectCommand({
			Key: imageKey,
			Body: file.buffer,
			Bucket: bucketName,
			ACL: "public-read",
			ContentType: file.mimetype,
		  });

		  await s3.send(imageUploadCommand);

		  // Generate the public URL of the uploaded image
		  const imageUrl = `https://${bucketName}.nyc3.digitaloceanspaces.com/${imageKey}`;

		  // 2. Create metadata with the image URL, latitude, and longitude
		  const metadata = {
			name: "NFT with Location Data",
			symbol: "NFTLOC",
			description: "An NFT minted with geolocation data.",
			image: imageUrl,
			attributes: [
			  { trait_type: "Latitude", value: latitude },
			  { trait_type: "Longitude", value: longitude },
			],
		  };

		  // Convert metadata to JSON and create a buffer
		  const metadataJson = JSON.stringify(metadata);
		  const metadataBuffer = Buffer.from(metadataJson, 'utf-8');
		  const metadataKey = `${location}/metadata-${Date.now()}.json`;

		  // 3. Upload the metadata file to DigitalOcean Spaces
		  const metadataUploadCommand = new PutObjectCommand({
			Key: metadataKey,
			Body: metadataBuffer,
			Bucket: bucketName,
			ACL: "public-read",
			ContentType: "application/json",
		  });

		  await s3.send(metadataUploadCommand);

		  // Generate the public URL of the uploaded metadata file
		  const metadataUrl = `https://${bucketName}.sfo3.digitaloceanspaces.com/${metadataKey}`;

		  // 4. Call the function to create the NFT collection with the metadata URL
		  const transaction = await this.createCollectionTransaction(fromPubKey, metadataUrl);

		  return transaction;
		} catch (error) {
		  console.error("Error uploading files or creating collection:", error);
		  throw new Error("Process could not be completed.");
		}
	  }
	static async uploadAndReturnUrl(file) {
		try {
		  const bucketName = "blockchainstarter"; // Nombre de tu bucket
		  const location = "uploads"; // Ruta opcional dentro del bucket
		  const key = `${location}/${file.filename}`;

		  const command = new PutObjectCommand({
			Key: key,
			Body: file.buffer,
			Bucket: bucketName,
			ACL: "public-read", // Define los permisos del archivo
			ContentType: file.mimetype,
		  });

		  await s3.send(command);

		  // Retornar la URL pública del archivo subido
		  return `https://${bucketName}.sfo3.digitaloceanspaces.com/${key}`;
		} catch (error) {
		  console.error("Error subiendo archivo:", error);
		  throw new Error("No se pudo subir el archivo");
		}
	  }
	static async createCollectionTransaction(fromPubKey, metadataUrl ) {
		umi.use(signerIdentity(createNoopSigner(fromPubKey)));
		umi.use(mplCandyMachine());
		const collectionMint = generateSigner(umi);
		const inputConfig = {
			mint: collectionMint,
			name: 'My Collection NFT',
			symbol: 'S6-example',
			uri: metadataUrl,
			sellerFeeBasisPoints: percentAmount(9.99, 2), // 9.99%
			isCollection: true,
		};
		console.log("input config: ", inputConfig)
		const collectionNFT = await createNft(umi, inputConfig);
		const {blockhash} = await umi.rpc.getLatestBlockhash();
		const transaction = await umi.transactions.create({
			version: 2,
			blockhash,
			instructions: collectionNFT.getInstructions(),
			payer: fromPubKey, // Establecer el pagador de la tarifa de la transacción
		});
		// sign the transaction using collectionMint
		const signedTransaction = await collectionMint.signTransaction(transaction);
		const serializedTransaction = umi.transactions.serialize(signedTransaction);
		return Buffer.from(serializedTransaction).toString('base64');
	}

	static async createCandyMachine(fromPubKey, collectionMintPubKey, metadata = {}) {
		umi.use(mplCandyMachine());
		umi.use(signerIdentity(createNoopSigner(fromPubKey)));
		const candyMachine = generateSigner(umi)
		const {blockhash} = await umi.rpc.getLatestBlockhash();
		const candyMachineCreation = await createCandyMachineV2(umi, {
			candyMachine,
			collectionMint: collectionMintPubKey,
			collectionUpdateAuthority: umi.identity,
			tokenStandard: TokenStandard.NonFungible,
			mutable: true,
			sellerFeeBasisPoints: percentAmount(9.99, 2), // 9.99%
			itemsAvailable: 2,
			symbol: 'CANDY',
			maxEditionSupply: 0,
			creators: [
				{
					address: umi.identity.publicKey,
					verified: true,
					percentageShare: 100,
				},
			],
			configLineSettings: some({
				prefixName: 'Candy',
				nameLength: 2,
				prefixUri: 'https://example.com/',
				uriLength: 100,
				isSequential: false,
			}),
		});
		const transaction = await umi.transactions.create({
			blockhash,
			instructions: candyMachineCreation.getInstructions(),
			payer: fromPubKey,
		});
		const signedTransaction = await candyMachine.signTransaction(transaction);
		const serializedTransaction = umi.transactions.serialize(signedTransaction);
		return Buffer.from(serializedTransaction).toString('base64');

	}

	static async createGuardAndWrap(fromPubKey, candyMachinePubKey) {
		umi.use(mplCandyMachine());
		umi.use(signerIdentity(createNoopSigner(fromPubKey)));
		const base = generateSigner(umi)
		const guardResult = await createCandyGuard(umi, {
			base,
			guards: {
				solPayment: {lamports: sol(0.001), destination: fromPubKey},
			},
		})
		console.log("Guard result", guardResult)
		const candyGuard = findCandyGuardPda(umi, {base: base.publicKey})
		const wrapObject = await wrap(umi, {
			candyMachine: candyMachinePubKey,
			candyGuard,
		})
		console.log("Wrap object", wrapObject)
		const instructions = [
			...guardResult.getInstructions(),
			...wrapObject.getInstructions(),
		]
		const {blockhash} = await umi.rpc.getLatestBlockhash();
		const transaction = await umi.transactions.create({
			blockhash,
			instructions: instructions,
			payer: fromPubKey,
		});
		const signedTransaction = await base.signTransaction(transaction);
		const serializedTransaction = umi.transactions.serialize(signedTransaction);
		return Buffer.from(serializedTransaction).toString('base64');
	}

	static async addConfigLines(fromPubKey, candyMachinePubKey, configLines = []) {
		umi.use(mplCandyMachine());
		umi.use(signerIdentity(createNoopSigner(fromPubKey)));

		const candyMachine = publicKey(candyMachinePubKey);
		const configLinesResult = await addConfigLines(umi, {
			candyMachine: candyMachine,
			index: 0,
			configLines: [
				{name: '#1', uri: 'https://example.com/nft1.json'},
				{name: '#2', uri: 'https://example.com/nft2.json'},
			],
		})

		console.log("Config lines result", configLinesResult)
		const {blockhash} = await umi.rpc.getLatestBlockhash();
		const transaction = await umi.transactions.create({
			blockhash,
			instructions: configLinesResult.getInstructions(),
			payer: fromPubKey,
		});

		const serializedTransaction = umi.transactions.serialize(transaction);
		return Buffer.from(serializedTransaction).toString('base64');
	}

	static async mintNFT(fromPubKey, candyMachine, collectionMintPubKey) {
		umi.use(mplCandyMachine());
		umi.use(signerIdentity(createNoopSigner(fromPubKey)));
		const candyMachineInfo = await fetchCandyMachine(umi, candyMachine);
		console.log("Candy machine information:")
		console.log(candyMachineInfo)
		const asset = generateSigner(umi);
		const mintResult = await mintV2(umi, {
			candyMachine: candyMachineInfo.publicKey,
			nftMint: asset,
			collectionMint: candyMachineInfo.collectionMint,
			collectionUpdateAuthority: umi.identity,
			candyGuard: candyMachine.mintAuthority,
		});
		const {blockhash} = await umi.rpc.getLatestBlockhash();
		const transaction = await umi.transactions.create({
			blockhash,
			instructions: mintResult.getInstructions(),
			payer: fromPubKey,
		});
		const signedTransaction = await asset.signTransaction(transaction);
		const serializedTransaction = umi.transactions.serialize(signedTransaction);
		return Buffer.from(serializedTransaction).toString('base64');
	}
}

export default MetaplexService;
