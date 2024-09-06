import { getRouter } from '@thewebchimp/primate';
import SolanaController from '../controllers/solana.controller.js';

const router = getRouter();

// Route to handle POST request to create Solana Pay URL
router.post('/create-pay-url', SolanaController.createPayURL);
router.post('/get-transaction-status', SolanaController.getTransactionStatus);

export  {router};
