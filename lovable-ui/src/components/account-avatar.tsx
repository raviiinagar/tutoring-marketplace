import { useState } from "react";
import { api, type User } from "@/lib/api";
import { accountInitial, useAccountPhoto } from "@/lib/account-photo";

export function AccountAvatar({
  user,
  className = "",
  decorative = false,
}: {
  user: User;
  className?: string;
  decorative?: boolean;
}) {
  const query = useAccountPhoto(user);
  const [failed, setFailed] = useState<string>();
  const photo = query.data?.photo;
  const usable =
    photo?.scan_status === "CLEAN" && (photo.status === "PENDING" || photo.status === "APPROVED");
  const src = usable ? api.photoPreviewUrl(photo.id) : undefined;
  const version = `${user.id}:${src}:${query.dataUpdatedAt}`;
  const loading = query.fetchStatus === "fetching" && !query.data;
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden ${className}`}
      aria-busy={loading}
      aria-hidden={decorative || undefined}
    >
      {src && failed !== version ? (
        <img
          key={version}
          src={src}
          alt="Your profile photo"
          className="h-full w-full object-cover"
          onError={() => setFailed(version)}
        />
      ) : loading ? (
        <span className="h-full w-full animate-pulse bg-muted" aria-hidden="true" />
      ) : (
        <span aria-hidden="true">{accountInitial(user.display_name)}</span>
      )}
    </span>
  );
}
