"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Zap, CheckCircle2, XCircle } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <XCircle className="w-10 h-10 text-red-500" />
        <p className="font-semibold text-gray-900">Lien invalide</p>
        <p className="text-sm text-gray-500">
          Ce lien de réinitialisation est manquant ou invalide.
        </p>
        <Link href="/forgot-password" className="text-emerald-600 hover:underline text-sm">
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Une erreur est survenue");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/login?reset=true"), 2500);
    } catch {
      setError("Une erreur est survenue. Réessayez.");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="p-3 rounded-full bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">Mot de passe réinitialisé !</p>
          <p className="text-sm text-gray-500 mt-1">
            Vous allez être redirigé vers la page de connexion…
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="password" className="text-gray-700">
          Nouveau mot de passe
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="Minimum 6 caractères"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-white/60 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-emerald-500"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm" className="text-gray-700">
          Confirmer le mot de passe
        </Label>
        <Input
          id="confirm"
          type="password"
          placeholder="Répéter le mot de passe"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="bg-white/60 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-emerald-500"
        />
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-lg shadow-emerald-500/20"
      >
        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Réinitialiser mon mot de passe
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-emerald-50/40 p-4">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-30" />

      <Card className="w-full max-w-md relative bg-white/70 border-gray-200/60 backdrop-blur-xl shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20">
              <Zap className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Nouveau mot de passe
          </CardTitle>
          <CardDescription className="text-gray-500">
            Choisissez un nouveau mot de passe pour votre compte
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Suspense fallback={<div className="h-32 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>}>
            <ResetPasswordForm />
          </Suspense>
        </CardContent>

        <CardFooter className="flex justify-center">
          <Link
            href="/login"
            className="text-sm text-gray-500 hover:text-emerald-600 transition-colors"
          >
            ← Retour à la connexion
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
