# Solana Pay Backend

This is the backend service for the Solana Pay Point of Sale system. It handles the creation of payment requests and monitors transactions on the Solana blockchain.

## Overview

The backend is responsible for:
- Generating Solana Pay URLs and QR codes for payments.
- Monitoring and confirming transactions using unique reference keys.
- Sending transaction status updates to the frontend.

## Key Features

- **Create Payment URL:** Generates a Solana Pay URL based on the payment amount and provides a QR code for scanning.
- **Transaction Monitoring:** Checks the status of payments using reference keys and confirms when the transaction is complete.
- **Integration with Solscan:** Provides a transaction link for verification on Solscan once payment is confirmed.

## API Endpoints

1. **`/solana/create-pay-url`**: 
   - **Method:** POST
   - **Description:** Creates a payment URL and QR code.
   - **Input:** `{ "amount": <total_amount> }`
   - **Output:** `{ "qrCodeData": <qr_code_url>, "reference": <reference_key> }`

2. **`/solana/get-transaction-status`**: 
   - **Method:** POST
   - **Description:** Checks the status of a transaction.
   - **Input:** `{ "reference": <reference_key> }`
   - **Output:** `{ "data": <transaction_hash> }`

## Getting Started

1. Clone the repository.
2. Install dependencies using Yarn:

   ```bash
   yarn install
