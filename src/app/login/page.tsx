"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Invalid credentials");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0e0c0a] text-[#f3ebdd] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Warm ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#d9a55b]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1e1a16] border border-[#2f2923] mb-4 text-[#d9a55b]">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-[#d9a55b]">Image</span> CDN & Upload
          </h1>
          <p className="text-[#b9ae9d] text-sm mt-2">
            Sign in to access your asset observatory
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#161311] border border-[#2f2923] rounded-2xl p-6 sm:p-8 space-y-5 shadow-2xl backdrop-blur-sm"
        >
          {error && (
            <div className="bg-[#e06060]/10 border border-[#e06060]/30 rounded-lg px-4 py-3 text-sm text-[#e06060]">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-[#b9ae9d]"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full px-3.5 py-2.5 bg-[#1e1a16] border border-[#2f2923] rounded-xl text-[#f3ebdd] placeholder-[#8e8374] focus:outline-none focus:border-[#d9a55b] focus:ring-2 focus:ring-[#d9a55b]/20 transition-all text-sm"
              placeholder="Enter your username"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[#b9ae9d]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-[#1e1a16] border border-[#2f2923] rounded-xl text-[#f3ebdd] placeholder-[#8e8374] focus:outline-none focus:border-[#d9a55b] focus:ring-2 focus:ring-[#d9a55b]/20 transition-all text-sm"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#d9a55b] hover:bg-[#e6b56c] active:bg-[#c59146] text-[#0e0c0a] font-semibold rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </main>
  );
}
