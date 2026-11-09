import { notFound } from "next/navigation";
import { Shell } from "@/components/social/shell";
import { ArtistPage } from "@/components/social/artist-page";

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function Page({ params }: { params: { mbid: string } }) {
  if (!MBID.test(params.mbid)) notFound();
  return <Shell><ArtistPage mbid={params.mbid} /></Shell>;
}
