import { useState } from "react";
import { assetUrl } from "@/lib/api";

type Peer = { display_name: string; photo_url: string | null };

/**
 * The other participant in a conversation: their public portrait when the
 * server provides one, otherwise a neutral initial. The image is decorative
 * (the name is always written next to it) and falls back if it fails to load.
 */
export function PeerAvatar({ peer, className = "" }: { peer: Peer; className?: string }) {
  const [failed, setFailed] = useState<string>();
  const src = peer.photo_url ? assetUrl(peer.photo_url) : undefined;
  const initial = peer.display_name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-semibold text-muted-foreground ${className}`}
    >
      {src && failed !== src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(src)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
