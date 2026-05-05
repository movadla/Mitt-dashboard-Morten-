import Dashboard from "./dashboard";
import { getTasks } from "@/lib/tasks";

export default async function Home() {
  const tasks = await getTasks();
  const today = new Date().toISOString().slice(0, 10);
  return <Dashboard tasks={tasks} today={today} />;
}
