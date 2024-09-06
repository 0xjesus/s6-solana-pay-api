// SolanaService.js
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { encodeURL } from '@solana/pay';
import BigNumber from 'bignumber.js';
import 'dotenv/config';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const MERCHANT_WALLET = new PublicKey(process.env.MERCHANT_WALLET);
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

class SolanaService {
  // Generate Solana Pay URL with a unique reference for tracking
  static async createSolanaPayURL(amount) {
    try {
      // Convert amount to BigNumber, ensure it's a valid number before converting
      if (!amount || isNaN(amount)) {
        throw new Error('Invalid amount specified for the transaction.');
      }

      const amountInSOL = new BigNumber(amount); // Ensure 'amount' is a valid numeric value

      // Generate a new reference key for each transaction
      const reference = Keypair.generate().publicKey; // Generate a unique reference for each transaction

      const transferRequest = {
        recipient: MERCHANT_WALLET,
        amount: amountInSOL,
        splToken: null,
        label: 'Payment for Products',
        message: 'Thank you for your purchase!',
        memo: 'POS Transaction',
        reference: [reference], // Add reference to track the transaction
      };

      const url = encodeURL(transferRequest);

      return { url, reference: reference.toString() };
    } catch (error) {
      console.error(`Failed to create Solana Pay URL: ${error.message}`);
      throw new Error(`Failed to create Solana Pay URL: ${error.message}`);
    }
  }

  // Verify the transaction status using the reference key
  static async getTransactionHash(reference) {
    try {
      const transactions = await connection.getSignaturesForAddress(new PublicKey(reference), { limit: 1 });

      if (transactions.length === 0) {
        return null; // No transaction found yet
      }

      return transactions[0].signature;
    } catch (error) {
      throw new Error(`Failed to fetch transaction hash: ${error.message}`);
    }
  }
}

export default SolanaService;
