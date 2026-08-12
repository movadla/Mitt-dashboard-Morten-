import Dashboard from "./dashboard";
import { getTasks } from "@/lib/tasks";
import { localDateString } from "@/lib/payday";

export default async function Home() {
  const tasks = await getTasks();
  const nowDate = new Date();
  const today = localDateString();
  const now = nowDate.toISOString();
  return <Dashboard tasks={tasks} today={today} now={now} />;
}

// Re-render fresh on every request so "now" reflects actual time.
export const dynamic = "force-dynamic";
