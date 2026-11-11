import { doorSalts } from "@/lib/doors";
import { json } from "@/lib/server-utils";

// The front door: always the same number of salts, real and decoy mixed, no names. Reveals nothing.
export async function GET() {
  return json({ doors: await doorSalts() });   // json() already sends no-store
}
