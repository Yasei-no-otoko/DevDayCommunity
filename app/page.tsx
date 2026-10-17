import { requireChatGPTUser } from "./chatgpt-auth";
import GameClient from "./game-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireChatGPTUser("/");
  return <GameClient />;
}
