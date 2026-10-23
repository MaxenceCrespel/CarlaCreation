import { EntityManager } from 'typeorm';

export const ERASED_CLIENT_LABEL = 'Client supprimé';

// Erases a person from the business's records (RGPD art. 17), used both by a
// client deleting their own account and by the admin deleting a fiche.
//
// - Reservations are kept — they feed the revenue stats — but stripped of
//   everything that identifies the person (also the additional guests booked
//   in the same group, and any guest booking made with the same email).
// - Invoices are deliberately left untouched: they must be kept 10 years by
//   law (Code de commerce L123-22), which RGPD art. 17(3)(b) allows.
// - Personal promo codes are deactivated and scrubbed (past reservations
//   still point at the row); the client row itself is deleted, which cascades
//   to the points ledger and any pending tokens.
export async function eraseClientData(manager: EntityManager, clientId: number): Promise<void> {
  const [client]: { email: string }[] = await manager.query(`SELECT email FROM clients WHERE id = $1`, [clientId]);
  if (!client) return;

  await manager.query(
    `UPDATE reservations
     SET client_name = $2, client_email = '', client_phone = '', client_address = NULL,
         notes = '', cancellation_reason = NULL, client_id = NULL
     WHERE client_id = $1
        OR ($3 <> '' AND lower(client_email) = lower($3))
        OR group_id IN (SELECT group_id FROM reservations WHERE client_id = $1 AND group_id IS NOT NULL)`,
    [clientId, ERASED_CLIENT_LABEL, client.email ?? ''],
  );
  await manager.query(`UPDATE promotions SET client_id = NULL, active = false, label = 'Code supprimé' WHERE client_id = $1`, [clientId]);
  await manager.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
}
