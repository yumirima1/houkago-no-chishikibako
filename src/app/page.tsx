import { ListeningRoom } from "@/components/ListeningRoom";
import { episodes } from "@/data/episodes";

export default function Home() {
  return <ListeningRoom episodes={episodes} />;
}
