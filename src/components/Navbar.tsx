"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user || pathname === "/login" || pathname === "/") return null;

  return (
    <nav className="sticky top-0 z-40 h-14 bg-ivi-navy flex items-center border-b border-white/10">
      <div className="max-w-2xl w-full mx-auto px-4 flex items-center gap-3">
        <Link
          href="/"
          className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-colors"
          aria-label="Torna all'app"
        >
          <ArrowLeft className="h-4 w-4 text-white" />
        </Link>

        <Link href="/" className="flex items-center shrink-0">
          <Image
            src="/IVI_white_marchio.png"
            alt="IVI Colors"
            width={100}
            height={32}
            className="h-7 w-auto object-contain"
            priority
          />
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <span className="hidden sm:block text-xs text-white/55 font-medium">{user.username}</span>
          <button
            onClick={logout}
            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center border-none cursor-pointer transition-colors"
            aria-label="Esci"
          >
            <LogOut className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>
    </nav>
  );
}
