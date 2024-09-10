import { getRouter } from '@thewebchimp/primate';
import SolanaController from '../controllers/solana.controller.js';
import multer from 'multer';

// Set up multer storage configuration
const storage = multer.memoryStorage(); // Store files in memory for quick access; adjust as needed
const upload = multer({ storage });

const router = getRouter();

// Route to handle POST request to create Solana Pay URL
router.post('/create-pay-url', SolanaController.createPayURL);
router.post('/get-transaction-status', SolanaController.getTransactionStatus);
router.post('/upload-and-create-collection', upload.single('file'), SolanaController.uploadAndCreateCollection);

export  {router};
