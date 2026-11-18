import { notFound } from "next/navigation";
import { Shell } from "@/components/social/shell";
import { AlbumPage } from "@/components/social/album-page";

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function Page({ params }: { params: { mbid: string } }) {
  if (!MBID.test(params.mbid)) notFound();
  return <Shell inner><AlbumPage mbid={params.mbid} /></Shell>;
}
