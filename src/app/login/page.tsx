"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { Eye, EyeOff, User } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setError("");
    setLoading(true);
    const err = await login(username, password);
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      router.push("/");
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      {/* Navy header with IVI branding */}
      <div className="bg-ivi-navy px-8 py-14 flex flex-col items-center">
        <Image
          src="/IVI_white_marchio.png"
          alt="IVI Colors"
          width={160}
          height={52}
          className="h-12 w-auto object-contain"
          priority
        />
        <div className="text-[11px] text-white/45 tracking-[0.2em] uppercase mt-3 font-medium">
          Portale Agenti
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="flex-1 px-6 pt-9 pb-6 flex flex-col gap-3.5"
      >
        {/* Username */}
        <div>
          <label className="block text-[11px] font-bold text-ivi-muted tracking-[0.08em] uppercase mb-1.5">
            Username
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-ivi-text opacity-35" />
            <input
              type="text"
              autoComplete="username"
              placeholder="mario.rossi"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-10 pr-3.5 py-3.5 border-[1.5px] border-ivi-border rounded-xl bg-ivi-bg text-ivi-text text-[15px] outline-none focus:border-ivi-navy transition-colors"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-[11px] font-bold text-ivi-muted tracking-[0.08em] uppercase mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit(e as unknown as React.FormEvent);
              }}
              className="w-full pl-3.5 pr-11 py-3.5 border-[1.5px] border-ivi-border rounded-xl bg-ivi-bg text-ivi-text text-[15px] outline-none focus:border-ivi-navy transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0 border-none bg-transparent cursor-pointer text-ivi-text opacity-35"
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-ivi-red font-medium">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full py-4 bg-ivi-navy disabled:bg-[#CBD5E1] text-white rounded-[13px] text-[15px] font-bold mt-1.5 transition-colors cursor-pointer disabled:cursor-default border-none"
        >
          {loading ? "Accesso…" : "Accedi"}
        </button>

        <div className="text-center">
          <span className="text-ivi-navy-light text-[13px] font-medium cursor-pointer">
            Password dimenticata?
          </span>
        </div>
      </form>

      <div className="px-6 pb-5 text-center">
        <span className="text-[11px] text-ivi-muted">
          Area riservata agenti IVI Colors Srl
        </span>
      </div>
    </div>
  );
}
