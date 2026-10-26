import { ListeningRoom } from "@/components/ListeningRoom";
import { episodes } from "@/data/episodes";
import { ObserverStudyRoot } from "@/components/observer-room/ObserverStudyRoot";
import { isPagesSite } from "@/lib/site-url";

export default function Home() {
  if (isPagesSite) return <ObserverStudyRoot />;
  return <ListeningRoom episodes={episodes} />;
}
