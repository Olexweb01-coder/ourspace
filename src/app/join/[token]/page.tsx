"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import BondMark from "@/components/BondMark";
import { api, ApiError } from "@/lib/api";
import { deriveKeys } from "@/lib/crypto-client";
import { initial } from "@/lib/format";
import { personalizeInstall } from "@/lib/install";
import { rememberSpace, setVault } from "@/lib/vault";

type Invite = {
  spaceId: string; role: "host" | "partner"; salt: string; iterations: number;
  hostName: string; label: string; existingName: string | null;
};

export default function JoinPage() {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Invite>(`/api/join?token=${encodeURIComponent(token)}`)
      .then((inv) => { setInvite(inv); if (inv.role === "partner" && !inv.existingName) setName(inv.label); })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Couldn't open this invite. Check your connection."));
  }, [token]);

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!invite || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { encKey, authToken, master } = await deriveKeys(password, invite.salt, invite.iterations);
      const res = await api<{ spaceId: string; memberId: string; name: string; label: string }>("/api/join", {
        body: { token, name, authToken },
      });
      rememberSpace({ spaceId: res.spaceId, memberId: res.memberId, label: res.label, myName: res.name });
      setVault({ encKey, master, spaceId: res.spaceId, memberId: res.memberId });
      personalizeInstall(res.spaceId, res.memberId);
      setPassword("");
      router.replace(`/chat?s=${res.spaceId}&m=${res.memberId}&welcome=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join. Check your connection.");
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="gate">
        <BondMark size={64} />
        <h1 className="gate__title">This link has closed</h1>
        <p className="gate__lead">{loadError}</p>
      </main>
    );
  }
  if (!invite) return <main className="gate" />;

  const relink = !!invite.existingName;
  return (
    <main className="gate">
      <BondMark size={64} a={initial(invite.hostName)} b={initial(invite.existingName ?? name)} />
      <h1 className="gate__title">{relink ? `Welcome back, ${invite.existingName}` : `${invite.hostName} made a space for you`}</h1>
      <p className="gate__lead">
        {relink
          ? "Enter your shared password to link this phone."
          : `Just the two of you, locked with a password ${invite.hostName} will tell you. Nobody else can read a word, not even the server.`}
      </p>
      <form className="gate__form" onSubmit={join}>
        {!relink && (
          <>
            <label className="label" htmlFor="n">Your name</label>
            <input id="n" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          </>
        )}
        <label className="label" htmlFor="p">Shared password</label>
        <input id="p" className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        <button className="btn btn--wide" disabled={busy || !password}>{busy ? "Opening…" : "Come in"}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </main>
  );
}
