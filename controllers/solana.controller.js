// SolanaController.js
import SolanaService from '../services/solana.service.js';
import MetaplexService from '../services/metaplex.service.js';
import CompressedNFTAirdropService from '../services/nft.service.js';
import QRCode from 'qrcode';
import cNftsService from "../services/cnfts.service.js";

// Import necessary packages
class SolanaController {
	static async uploadAndCreateCollection(req, res) {
		try {
			const {fromPubKey, latitude, longitude} = req.body;
			const file = req.file; // The file is expected to be provided in the request

			if (!file) {
				return res.respond({
					data: null,
					message: 'No file provided.',
				});
			}

			// Call the service to upload the image, create metadata, and create the NFT collection
			const transaction = await MetaplexService.uploadFileAndCreateCollection(
				fromPubKey,
				file,
				latitude,
				longitude
			);

			res.respond({
				data: {
					transaction,
				},
				message: 'File and metadata uploaded, and collection created successfully.',
			});
		} catch (error) {
			res.respond({
				data: error.message,
				message: `Error processing the request: ${error.message}`,
			});
		}
	}

	// Handle request to create Solana Pay URL and generate QR Code
	static async createPayURL(req, res) {
		try {
			const amount = 0.001; // Set amount to 0.001 SOL for testing
			const {url, reference} = await SolanaService.createSolanaPayURL(amount);

			// Generate the QR Code from the URL
			const qrCodeData = await QRCode.toDataURL(url.toString());

			// Return QR Code and reference key for transaction tracking
			res.respond({
				data: {qrCodeData, reference},
				message: 'QR Code generated successfully. Please complete the payment.',
			});
		} catch (error) {
			res.respond({
				data: error.message,
				message: `Error: ${error.message}`,
			});
		}
	}

	// Endpoint to check the transaction status and get the hash
	static async getTransactionStatus(req, res) {
		try {
			const {reference} = req.body;

			// Fetch transaction hash using the reference
			const hash = await SolanaService.getTransactionHash(reference);

			if (!hash) {
				res.respond({
					data: null,
					message: 'Transaction not confirmed yet. Please wait...',
				});
			} else {
				res.respond({
					data: hash,
					message: 'Transaction confirmed successfully.',
				});
			}
		} catch (error) {
			res.respond({
				data: error.message,
				message: `Error: ${error.message}`,
			});
		}
	}

	static async mintCompressedNFTs(req, res) {
		try {
			const {fromPubKey, collectionMintPubKey, merkleTreeAddr} = req.body;
			let {wallets} = req.body;


			if (!wallets || wallets.length === 0) {
				return res.respond({
					data: null,
					message: 'No wallets provided for airdrop.',
				});
			}

			if (!collectionMintPubKey) {
				return res.respond({
					status: 400,
					data: null,
					message: 'No collection mint public key provided.',
				});
			}

			if(!merkleTreeAddr) {
				return res.respond({
					status: 400,
					data: null,
					message: 'No Merkle Tree address provided.',
				});
			}


			// Call the service to mint compressed NFTs and return the encoded transaction
			console.log("Minting compressed NFTs to wallets:", wallets);
			const encodedTransaction = await cNftsService.mintCompressedNfts(
				fromPubKey,
				wallets,
				collectionMintPubKey,
				merkleTreeAddr
			);


			res.json({ data: {transaction: encodedTransaction} });
		} catch (error) {
			res.respond({
				data: error.message,
				message: `Error processing the request: ${error.message}`,
			});
		}
	}

	static async createMerkleTree(req, res) {
		try {
			const fromPubKey = req.body.fromPubKey;
			if (!fromPubKey) {
				return res.respond({
					status: 400,
					data: null,
					message: 'No wallet address provided.',
				});
			}
			const tree = await CompressedNFTAirdropService.createMerkleTree(fromPubKey);
			res.respond({
				data: {
					transaction: tree,
				},
				message: 'Merkle Tree created successfully.',
			});
		} catch (error) {
			console.error('Error creating Merkle Tree:', error);
			res.respond({
				status: 500,
				data: error.message,
				message: `Error creating Merkle Tree: ${error.message}`,
			});
		}
	}

	static async createCollection(req, res) {
		try {
			const {fromPubKey, metadata} = req.body;
			const file = req.file; // The file is expected to be provided in the request

			if (!file) {
				return res.respond({
					data: null,
					message: 'No file provided.',
				});
			}

			if (!metadata) {
				return res.respond({
					data: null,
					message: 'No metadata provided.',
				});
			}

			if(!fromPubKey) {
				return res.respond({
					data: null,
					message: 'No wallet address provided.',
				});
			}

			// Call the service to create the collection with the uploaded file and metadata
			const transaction = await MetaplexService.createCollectionWithMetadata(fromPubKey, file, metadata);

			res.respond({
				data: {
					transaction,
				},
				message: 'Collection created successfully.',
			});
		} catch (error) {
			res.respond({
				data: error.message,
				message: `Error creating collection: ${error.message}`,
			});
		}
	}

	static async verifyCollection(req, res) {
		const {collectionMint, collectionMintAuthority, merkleTreeAddr} = req.body;
		try {
			const transaction = await cNftsService.verifyCollection(collectionMint, collectionMintAuthority, merkleTreeAddr);
			res.json({ data: {transaction} });
		} catch (error) {
			console.error('Error verifying collection:', error);
			res.status(500).json({ error: error.message });
		}

	}

	static async verifyCollectionNewFunction(req, res) {
		const { fromPubKey, collectionMint, mint } = req.body;
		try {
			console.log("fromPubKey:", fromPubKey);
			console.log("mint:", mint);
			const transaction = await cNftsService.verifyCollectionNewFunction(fromPubKey, collectionMint, mint);
			res.json({ data: {transaction} });
		} catch (error) {
			console.error('Error verifying collection:', error);
			res.status(500).json({ error: error.message });
		}
	}
}

export default SolanaController;
