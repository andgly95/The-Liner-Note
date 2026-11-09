import { Shell } from "@/components/social/shell";
import { ProfilePage } from "@/components/social/profile-page";

export default function Page({ params }: { params: { handle: string } }) {
  return <Shell><ProfilePage handle={decodeURIComponent(params.handle)} /></Shell>;
}
