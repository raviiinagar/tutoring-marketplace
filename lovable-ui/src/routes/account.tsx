import { Button } from "@/components/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeFailure, type User, type AccountSession } from "@/lib/api";
import { AuthShell, Notice, useSingleFlight } from "@/components/account/ui";

export const Route = createFileRoute("/account")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Your account — Tutor Marketplace" },
      { name: "description", content: "Your private Tutor Marketplace account." },
      { property: "og:title", content: "Your account — Tutor Marketplace" },
      { property: "og:description", content: "Your private Tutor Marketplace account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Account,
});

function Account() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [signOutError, setSignOutError] = useState<string>();
  const signOut = useSingleFlight();
  const [sessions,setSessions]=useState<AccountSession[]>([]);
  const [securityError,setSecurityError]=useState<string>();
  const security=useSingleFlight();
  const [hasStaff,setHasStaff]=useState(false);

  const load = useCallback(async () => {
    setLoadError(undefined);
    const res = await api.me();
    if (res.ok) {
      setUser(res.data.user);
      const staff=await api.staffAccess();setHasStaff(staff.ok);
      const listed=await api.sessions();
      if(listed.ok)setSessions(listed.data.sessions);
      else if(listed.error.kind==='http'&&listed.error.status===401)navigate({to:'/auth/signin',replace:true});
      else setSecurityError(describeFailure(listed.error));
    }
    else if (res.error.kind === "http" && res.error.status === 401) navigate({ to: "/auth/signin", replace: true });
    else setLoadError(describeFailure(res.error));
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);
  const toggleRole=(role:User['roles'][number])=>security.run(async()=>{
    if(!user)return;setSecurityError(undefined);
    const roles=user.roles.includes(role)?user.roles.filter(value=>value!==role):[...user.roles,role];
    const previous=user;setUser({...user,roles});
    const result=await api.changeRoles(roles);
    if(result.ok)setUser(result.data.user);
    else {
      setUser(previous);
      if(result.error.kind==='http'&&result.error.status===401)navigate({to:'/auth/signin',replace:true});
      else setSecurityError(describeFailure(result.error));
    }
  });
  const revoke=(id?:string)=>security.run(async()=>{
    setSecurityError(undefined);const result=id?await api.revokeSession(id):await api.revokeOthers();
    if(result.ok)await load();
    else if(result.error.kind==='http'&&result.error.status===401)navigate({to:'/auth/signin',replace:true});
    else setSecurityError(describeFailure(result.error));
  });

  const onSignOut = () =>
    signOut.run(async () => {
      setSignOutError(undefined);
      const res = await api.signOut();
      if (res.ok) {
        setUser(null);
        navigate({ to: "/auth/signin", replace: true });
      } else setSignOutError(describeFailure(res.error));
    });

  if (!user)
    return (
      <AuthShell title="Your account">
        {loadError ? (
          <div className="space-y-5">
            <Notice tone="error">{loadError}</Notice>
            <Button type="button" variant="outline" className="min-h-12 w-full" onClick={() => void load()}>Try again</Button>
          </div>
        ) : (
          <p role="status" className="text-muted-foreground">Loading your account…</p>
        )}
      </AuthShell>
    );

  return (
    <AuthShell title={`Hello, ${user.display_name}`}>
      <dl className="divide-y rounded-xl border">
        <Row label="Name" value={user.display_name} />
        <Row label="Email" value={user.email} />
        <Row label="Email status" value={user.email_verified ? "Verified" : "Not verified"} />
      </dl>
      {user.roles.includes('LEARNER')&&<Link to="/learners" className="link mt-5 block">Manage Learner profiles</Link>}
      {user.roles.includes('TUTOR')&&<Link to="/tutor" className="link mt-5 block">Manage Tutor profile and evidence</Link>}
      {hasStaff&&<Link to="/staff" className="link mt-5 inline-block">Open staff console</Link>}
      <section className="mt-6 space-y-3" aria-labelledby="roles-title">
        <h2 id="roles-title" className="font-semibold">How you use your account</h2>
        <p className="text-sm text-muted-foreground">Choose one or both roles. Tutor listings require approval before publication.</p>
        {(['LEARNER','TUTOR'] as const).map(role=><label key={role} className="flex items-center gap-3"><input type="checkbox" checked={user.roles.includes(role)} disabled={security.loading||(user.roles.length===1&&user.roles.includes(role))} onChange={()=>void toggleRole(role)}/>{role==='LEARNER'?'Learner':'Tutor'}</label>)}
      </section>
      <section className="mt-6 space-y-3" aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="font-semibold">Active sessions</h2>
        <ul className="space-y-3">{sessions.map(session=><li key={session.id} className="rounded-xl border p-3"><p>{session.current?'This session':'Other session'}</p><p className="text-sm text-muted-foreground">Signed in {new Date(session.created_at).toLocaleString()}. Expires {new Date(session.expires_at).toLocaleString()}.</p><Button type="button" variant="outline" className="mt-2" disabled={security.loading} onClick={()=>void revoke(session.id)}>{session.current?'Sign out this session':'Revoke session'}</Button></li>)}</ul>
        <Button type="button" variant="outline" disabled={security.loading||!sessions.some(session=>!session.current)} onClick={()=>void revoke()}>Sign out other sessions</Button>
      </section>
      {securityError&&<div className="mt-4"><Notice tone="error">{securityError}</Notice></div>}
      <div className="mt-6">
        <Notice tone="info">Tutor listings and discovery will appear as they become available.</Notice>
      </div>
      {signOutError && <div className="mt-4"><Notice tone="error">{signOutError}</Notice></div>}
      <Button type="button" variant="outline" className="mt-6 min-h-12 w-full" onClick={onSignOut} disabled={signOut.loading}>
        {signOut.loading ? "Signing out…" : "Sign out"}
      </Button>
    </AuthShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-all font-medium">{value}</dd>
    </div>
  );
}
