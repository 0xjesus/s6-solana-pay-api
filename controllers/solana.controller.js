// SolanaController.js
import SolanaService from '../services/solana.service.js';
import QRCode from 'qrcode';
// Import necessary packages
class SolanaController {
  static async uploadAndCreateCollection(req, res) {
    try {
      const { fromPubKey, latitude, longitude } = req.body;
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
        data: transaction,
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
      const { url, reference } = await SolanaService.createSolanaPayURL(amount);

      // Generate the QR Code from the URL
      const qrCodeData = await QRCode.toDataURL(url.toString());

      // Return QR Code and reference key for transaction tracking
      res.respond({
        data: { qrCodeData, reference },
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
      const { reference } = req.body;

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
}

export default SolanaController;
