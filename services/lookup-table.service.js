import { AddressLookupTableProgram, Connection, PublicKey, Transaction } from '@solana/web3.js';

class LookupTableService {
  /**
   * Crea o extiende una Address Lookup Table con las direcciones necesarias.
   * @param {Connection} connection - Conexión a la red de Solana.
   * @param {PublicKey} authority - Clave pública de la autoridad que gestiona la Lookup Table.
   * @param {Keypair} payer - Keypair del pagador (Signer).
   * @param {Array<PublicKey>} addresses - Array de direcciones a incluir en la Lookup Table.
   * @returns {Promise<PublicKey>} - Dirección de la Address Lookup Table creada o extendida.
   */
  static async createOrExtendLookupTable(connection, authority, payer, addresses) {
    try {
      // Obtener el slot reciente
      const recentSlot = await connection.getSlot('finalized');
      console.log('Recent Slot:', recentSlot);

      // Crear la instrucción para crear la Lookup Table
      const [lookupTableInst, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
        authority,
        payer: payer.publicKey,
        recentSlot,
      });
      console.log('Address Lookup Table creado en:', lookupTableAddress.toBase58());

      // Extender la Address Lookup Table con las direcciones necesarias
      console.log('Extendiendo Address Lookup Table con direcciones necesarias...');
      const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: payer.publicKey,
        authority,
        lookupTable: lookupTableAddress,
        addresses,
      });

      // Construir la transacción para crear y extender la ALT
      const transaction = new Transaction().add(lookupTableInst, extendInstruction);
      transaction.feePayer = payer.publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Firmar y enviar la transacción
      const signature = await connection.sendTransaction(transaction, [payer], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      console.log('Transacción de ALT enviada con firma:', signature);

      return lookupTableAddress;
    } catch (error) {
      console.error('Error creando o extendiendo la Address Lookup Table:', error);
      throw error;
    }
  }
}

export default LookupTableService;
