import type Database from "better-sqlite3";

export function getUserRapNumbers(db: Database.Database, userId: number): number[] {
  const rows = db
    .prepare("SELECT rap FROM rap_assignments WHERE user_id = ? ORDER BY rap")
    .all(userId) as { rap: number }[];
  return rows.map((r) => r.rap);
}

export function getUserIdByUsername(db: Database.Database, username: string): number | null {
  const row = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: number } | undefined;
  return row ? row.id : null;
}

/**
 * Returns true if the user can access the given customer because the customer's rap is
 * assigned to that user. Returns false if customer has no rap or rap is not assigned to user.
 */
export function userOwnsCustomerByRap(
  db: Database.Database,
  userId: number,
  clienteId: number | null
): boolean {
  if (!clienteId) return false;
  const row = db
    .prepare(
      `SELECT 1
       FROM anagrafiche a
       JOIN rap_assignments ra ON ra.rap = a.rap
       WHERE a.id = ? AND ra.user_id = ?
       LIMIT 1`
    )
    .get(clienteId, userId);
  return Boolean(row);
}
