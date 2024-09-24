// CompressedNFTAirdropService.js

import {createUmi} from '@metaplex-foundation/umi-bundle-defaults';
import {
	createNoopSigner, generateSigner,
	publicKey,
	signerIdentity,
	transactionBuilder,
} from '@metaplex-foundation/umi';
import {
	fetchMerkleTree,
	fetchTreeConfigFromSeeds,
	findLeafAssetIdPda,
	getAssetWithProof,
	mintToCollectionV1,
	mplBubblegum,
	verifyCollection as verifyCollectionInstruction,
} from '@metaplex-foundation/mpl-bubblegum';
import {
	AddressLookupTableProgram,
	Connection,
	PublicKey,
	Transaction,
	VersionedTransaction,
	TransactionMessage,
	TransactionInstruction,
} from '@solana/web3.js';
import {verifyCollectionV1, verifyCreatorV1} from "@metaplex-foundation/mpl-token-metadata";
import { findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';

/**
 * Clase para manejar el airdrop de NFTs comprimidos en Solana.
 */
class cNftsService {
	/**
	 * Método para crear una Address Lookup Table para una transacción dada.
	 * @param {Array<TransactionInstruction>} instructions - Instrucciones de la transacción.
	 * @param {string} payerPublicKey - Clave pública del pagador.
	 * @returns {Object} - Objeto que contiene la transacción de ALT encodificada y la dirección de la ALT.
	 */
	static async createAddressLookupTable(instructions, payerPublicKey) {
		try {
			const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
			console.log('Conexión a Solana establecida.');

			// Obtener el último blockhash
			const {blockhash} = await connection.getLatestBlockhash('confirmed');

			// Obtener todas las cuentas usadas en las instrucciones
			let instructionAccounts = [];
			for (const instruction of instructions) {
				instructionAccounts = instructionAccounts.concat(instruction.keys);
			}

			// Crear Address Lookup Table
			console.log('Creando Address Lookup Table...');
			const recentSlot = await connection.getSlot('finalized');
			console.log('Recent Slot:', recentSlot);
			const [lookupTableInst, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
				authority: new PublicKey(payerPublicKey),
				payer: new PublicKey(payerPublicKey),
				recentSlot,
			});
			console.log('Address Lookup Table creado en:', lookupTableAddress.toBase58());

			// Extender la Address Lookup Table con las direcciones necesarias
			console.log('Extendiendo Address Lookup Table con direcciones necesarias...');
			const addressesToInclude = instructionAccounts
				.filter((account) => !account.isSigner)
				.map((account) => new PublicKey(account.pubkey));
			console.log('Addresses to include in ALT:', addressesToInclude.map((a) => a.toBase58()));
			const extendInstruction = AddressLookupTableProgram.extendLookupTable({
				payer: new PublicKey(payerPublicKey),
				authority: new PublicKey(payerPublicKey),
				lookupTable: lookupTableAddress,
				addresses: addressesToInclude,
			});

			// Construir la transacción para crear y extender el ALT
			const altTransaction = new Transaction().add(lookupTableInst, extendInstruction);
			altTransaction.recentBlockhash = blockhash;
			altTransaction.feePayer = new PublicKey(payerPublicKey);

			// Serializar y codificar la transacción de ALT
			const serializedAltTx = altTransaction.serialize({requireAllSignatures: false});
			const encodedAltTx = Buffer.from(serializedAltTx).toString('base64');

			// Retornar la transacción de ALT encodificada y la dirección de la ALT
			return {
				altTransactionEncoded: encodedAltTx,
				lookupTableAddress: lookupTableAddress.toBase58(),
			};
		} catch (error) {
			console.error('Error creando la ALT:', error);
			throw error;
		}
	}

	/**
	 * Método estático para mintar NFTs comprimidos a múltiples wallets.
	 * @param {string} fromPubKey - Public key de la cuenta que firma la transacción.
	 * @param {Array<string>} wallets - Array de direcciones de wallets destino.
	 * @param {string} collectionMintPubKey - Public key del mint de la colección.
	 * @param {string} merkleTreeAddr - Dirección de la Merkle Tree.
	 * @param {string} [lookupTableAddress] - Dirección de la Address Lookup Table (opcional).
	 * @returns {string} - Transacción serializada y codificada en base64.
	 */
	static async mintCompressedNfts(
		fromPubKey,
		wallets,
		collectionMintPubKey,
		merkleTreeAddr,
	) {
		console.log('=== Iniciando mintCompressedNfts ===');
		console.log('Parámetros recibidos:');
		console.log('fromPubKey:', fromPubKey);
		console.log('wallets:', wallets);
		console.log('collectionMintPubKey:', collectionMintPubKey);
		console.log('merkleTreeAddr:', merkleTreeAddr);

		try {
			// URLs de imagen y metadata (puedes modificarlas según tus necesidades)
			const imageUrl =
				'https://blockchainstarter.nyc3.digitaloceanspaces.com/uploads/uploaded-image-1726526965762.jpg';
			const metadataUrl =
				'https://blockchainstarter.nyc3.digitaloceanspaces.com/uploads/fellowship.json';
			console.log('Metadata URL:', metadataUrl);

			// Inicializar una nueva instancia de Umi para esta transacción
			const umi = createUmi('https://api.mainnet-beta.solana.com');
			console.log('Instancia de Umi creada.');

			// Agregar middlewares necesarios
			umi.use(signerIdentity(createNoopSigner(fromPubKey)));
			umi.use(mplBubblegum());
			console.log('Middlewares agregados a Umi.');

			// Inicializar el builder de transacciones
			let newTxBuilder = transactionBuilder();
			console.log('Transaction builder inicializado.');

			// Obtener la cuenta de la Merkle Tree
			console.log('Fetching Merkle Tree desde:', merkleTreeAddr);
			const merkleTreeAccount = await fetchMerkleTree(umi, merkleTreeAddr);
			console.log('Merkle Tree Account:', merkleTreeAccount);

			// Obtener la configuración de la Merkle Tree
			console.log('Fetching Tree Config desde seeds.');
			const treeConfig = await fetchTreeConfigFromSeeds(umi, {
				merkleTree: merkleTreeAddr,
				header: merkleTreeAccount.header,
			});
			console.log('Tree Config:', treeConfig);

			console.log('Collection Mint PubKey:', collectionMintPubKey);
			console.log('Merkle Tree Address:', merkleTreeAddr);

			// Iterar sobre cada wallet y crear instrucciones de minting
			let startIndex = 37;
			for (const wallet of wallets) {
				console.log('Procesando wallet:', wallet);

				// Validar que la wallet sea una dirección válida de Solana
				try {
					new PublicKey(wallet);
				} catch (validationError) {
					console.warn(`Dirección de wallet inválida: ${wallet}. Saltando...`);
					continue; // Saltar wallets inválidas
				}
				// Crear la instrucción de minting a la colección

				/// get the number of nfts from the tree:
				const mintToCollectionIxBuilder = await mintToCollectionV1(umi, {
					leafOwner: publicKey(wallet), // Asignar a cada wallet individualmente
					merkleTree: publicKey(merkleTreeAddr),
					collectionMint: publicKey(collectionMintPubKey),
					metadata: {
						name: `_0xJesus #${startIndex}`, // Nombre del NFT
						symbol: '0XJ',
						uri: metadataUrl,
						sellerFeeBasisPoints: 500, // 5%
						collection: {key: publicKey(collectionMintPubKey), verified: true},
						collectionAuthority: umi.identity.publicKey,
						creators: [{address: umi.identity.publicKey, verified: true, share: 100}],
					},
				});
				console.log(`Instrucción creada para wallet: ${wallet}`);

				// Añadir la instrucción al builder de transacciones
				newTxBuilder = newTxBuilder.add(mintToCollectionIxBuilder);
				console.log('======================Instrucción añadida al transaction builder.');
				console.log('Instrucción:', mintToCollectionIxBuilder.items[0].instruction);
				startIndex++;
			}

			// Construir la transacción con las instrucciones agregadas
			console.log('Construyendo la transacción con las instrucciones agregadas.');
			const transaction = await newTxBuilder.buildWithLatestBlockhash(umi);

			// Sin ALT, serializar la transacción normalmente
			const serializedTransaction = umi.transactions.serialize(transaction);
			console.log('Transacción serializada:', serializedTransaction);

			// Codificar la transacción en base64
			const transactionEncoded = Buffer.from(serializedTransaction).toString('base64');
			console.log('Transacción encodificada (base64):', transactionEncoded);

			console.log('=== Fin de mintCompressedNfts ===');
			return transactionEncoded;
		} catch (error) {
			console.error('Error durante el airdrop de NFT comprimidos:', error);
			throw new Error('Compressed NFT Airdrop failed.');
		}
	}

	/**
	 * Método estático para verificar la colección.
	 * @param {string} collectionMint - Public key del mint de la colección.
	 * @param {string} collectionAuthority - Public key de la autoridad de la colección.
	 * @param {string} merkleTreeAddr - Dirección de la Merkle Tree.
	 * @param {number} initialLeafIndex - Índice inicial de la hoja (por defecto 1).
	 * @param {string} [lookupTableAddress='B1RkqEG9NAtXm3Bq156LaJUe2iko5YbtTMYp3pc4pYLT'] - Dirección de la Address Lookup Table (por defecto).
	 * @returns {string} - Transacción serializada y codificada en base64.
	 */
	static async verifyCollection(
		collectionMint,
		collectionAuthority,
		merkleTreeAddr,
		initialLeafIndex = 0,
		lookupTableAddress = 'Anvwf6nWnBVSCdxpPCF2w2YqRFgPvRMCeS33hvZA2tbs'
	) {
		console.log('=== Iniciando verifyCollection ===');
		console.log('Parámetros recibidos:');
		console.log('collectionMint:', collectionMint);
		console.log('collectionAuthority:', collectionAuthority);
		console.log('merkleTreeAddr:', merkleTreeAddr);
		console.log('lookupTableAddress:', lookupTableAddress);

		/// create the lookup table
		/// create the address lookup table

		try {
			// Inicializar instancia de Umi
			const umi = createUmi('https://api.mainnet-beta.solana.com');
			console.log('Instancia de Umi creada.');

			// Agregar middlewares necesarios
			umi.use(signerIdentity(createNoopSigner(collectionAuthority)));
			umi.use(mplBubblegum());

			// Fetch Merkle Tree Account
			const merkleTreeAccount = await fetchMerkleTree(umi, publicKey(merkleTreeAddr));
			console.log('Merkle Tree Account:', merkleTreeAccount);

			// Fetch Tree Configuration
			const treeConfig = await fetchTreeConfigFromSeeds(umi, {
				merkleTree: publicKey(merkleTreeAddr),
				header: merkleTreeAccount.header,
			});
			console.log('Tree Config:', treeConfig);

			// Obtener assetId usando un leafIndex inicial
			const [assetId, bump] = await findLeafAssetIdPda(umi, {
				merkleTree: publicKey(merkleTreeAddr),
				leafIndex: initialLeafIndex,
			});

			// Obtener el assetWithProof usando assetId
			const assetWithProof = await getAssetWithProof(umi, assetId, {truncateCanopy: true});
			console.log('Asset with Proof:', assetWithProof);

			// Verificar la colección
			const verifyIxBuilder = await verifyCollectionInstruction(umi, {
				...assetWithProof,
				collectionMint: publicKey(collectionMint),
				collectionAuthority: publicKey(collectionAuthority),
			});
			console.log('Verify Instruction Builder:', verifyIxBuilder);

			// Construir la transacción
			let newTxBuilder = transactionBuilder().add(verifyIxBuilder);

			const transaction = await newTxBuilder.buildWithLatestBlockhash(umi);

			// Si se proporciona una ALT, usamos VersionedTransaction
			console.log('Usando Address Lookup Table:', lookupTableAddress);
			const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
			const {blockhash} = await connection.getLatestBlockhash('confirmed');

			// Obtener las instrucciones de la transacción desde el transaction builder
			const instructions = [];
			for (const item of newTxBuilder.getInstructions()) {
				// Convertir la instrucción de Umi a TransactionInstruction de web3.js
				console.log('Item:', item);
				const web3Instruction = new TransactionInstruction({
					keys: item.keys.map((key) => ({
						pubkey: new PublicKey(key.pubkey),
						isSigner: key.isSigner,
						isWritable: key.isWritable,
					})),
					programId: new PublicKey(item.programId),
					data: Buffer.from(item.data)
				});

				console.log('Web3 Instruction:', web3Instruction);
				instructions.push(web3Instruction);
			}
			console.log("==========================lookupTableAddress", lookupTableAddress);
			if (!lookupTableAddress) {
				const createAlt = await cNftsService.createAddressLookupTable(instructions, collectionAuthority);
				return createAlt.altTransactionEncoded;
			}
			console.log('lkookupTable parameter', new PublicKey(lookupTableAddress));
			const lookupTableAccount = (
				await connection.getAddressLookupTable(new PublicKey(lookupTableAddress))
			).value;
			console.log('lookupTableAccount:', lookupTableAccount);
			// Crear el mensaje de transacción versionado

			console.log("instructions------------------------->", instructions);

			const messageV0 = new TransactionMessage({
				payerKey: new PublicKey(collectionAuthority),
				recentBlockhash: blockhash,
				instructions: instructions,
			}).compileToV0Message(
				[lookupTableAccount],
			);

			const versionedTx = new VersionedTransaction(messageV0);
			const simulationResult = await connection.simulateTransaction(versionedTx, {
				sigVerify: false,
				commitment: 'confirmed',
			});

			console.log('Simulation Result:', simulationResult);

			if (simulationResult.value.err) {
				console.error('Transaction simulation failed:', simulationResult.value.err);
				// Aquí puedes analizar simulationResult.value.logs para obtener más detalles
				throw new Error('Transaction simulation failed');
			}
			// Serializar la transacción
			const serializedTransaction = versionedTx.serialize();
			console.log('Transacción serializada:', serializedTransaction);

			// Codificar la transacción en base64
			const transactionEncoded = Buffer.from(serializedTransaction).toString('base64');
			console.log('Transacción encodificada (base64):', transactionEncoded);

			return transactionEncoded;

			/*				// Sin ALT, serializar la transacción normalmente
							const serializedTransaction = umi.transactions.serialize(transaction);
							console.log('Transacción serializada:', serializedTransaction);

							// Codificar la transacción a base64
							const transactionEncoded = Buffer.from(serializedTransaction).toString('base64');
							console.log('Transacción encodificada (base64):', transactionEncoded);

							return transactionEncoded;
						*/
		} catch (error) {
			console.error('Error verifying collection:', error);
			throw error;
		}
	}

	static async verifyCreator(fromPubKey) {
		// Inicializar instancia de Umi
		try {
			const umi = createUmi(process.env.SOLANA_RPC_URL);
			console.log('Instancia de Umi creada.');


			// Agregar middlewares necesarios
			umi.use(signerIdentity(createNoopSigner('BP1ZpUfzfjojR7aMp3n8SDf19iTGkuh7axK6VFfmrnxY')));

			// Verificar el creador


			const txObj = await verifyCreatorV1(umi, {
				metadata: '8UQPzfgZrKG4h17sbcz1xmkDKjzPhLeApofVJVFxg1b5',
			})

			console.log('Verify Creator:', txObj);

			// Construir la transacción
			let newTxBuilder = transactionBuilder().add(txObj);

			console.log("newTxBuilder", newTxBuilder);
			const transaction = await newTxBuilder.buildWithLatestBlockhash(umi);
			console.log('Transacción construida:', transaction);

			// Serializar la transacción
			const serializedTransaction = umi.transactions.serialize(transaction);
			console.log('Transacción serializada:', serializedTransaction);

			// Codificar la transacción en base64
			const transactionEncoded = Buffer.from(serializedTransaction).toString('base64');
			console.log('Transacción encodificada (base64):', transactionEncoded);

			return transactionEncoded;
		} catch (error) {
			console.error('Error verifying creator:', error);
			throw error;
		}
	}

	static async verifyCollectionNewFunction(fromPubKey, collectionMint, mint) {
		const umi = createUmi('https://api.mainnet-beta.solana.com');
		umi.use(signerIdentity(createNoopSigner(fromPubKey)));
		console.log("fromPubKey:", fromPubKey);
		console.log("mint:", mint);
		console.log("collectionMint:", collectionMint);
		const metadata = findMetadataPda(
			umi, {
				mint: mint
			}
		)
		console.log("metadata", metadata);
		const newTx = await verifyCollectionV1(umi, {
			metadata,
			collectionMint: publicKey(collectionMint),
			authority: publicKey(fromPubKey)
		})

		const txBuilder = transactionBuilder().add(newTx);
		// partially sign
		const transaction = await txBuilder.buildWithLatestBlockhash(umi);
		/// sign using this: HR2qrQ8NkLkvGBfsYJ4dzjykRtTPvoSnaEcJUrrzcD1N
		const serializedTransaction = umi.transactions.serialize(transaction);
		const encodedTransaction = Buffer.from(serializedTransaction).toString('base64');
		// sign partially

		return encodedTransaction;

	}
}

export default cNftsService;
