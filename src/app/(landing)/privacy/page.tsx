import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Politique de confidentialité — Skalle",
  description:
    "Comment Skalle collecte, utilise et protège vos données personnelles.",
};

const LAST_UPDATED = "15 mars 2026";
const CONTACT_EMAIL = "privacy@skalle.io";
const COMPANY_NAME = "Skalle";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-12 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>

        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Politique de confidentialité
          </h1>
          <p className="text-slate-400 text-sm">
            Dernière mise à jour : {LAST_UPDATED}
          </p>
        </div>

        {/* Content */}
        <div className="space-y-10 text-slate-300 leading-relaxed">

          {/* Intro */}
          <Section title="1. Introduction">
            <p>
              {COMPANY_NAME} (&quot;nous&quot;, &quot;notre&quot;) exploite la
              plateforme Skalle, un OS marketing et commercial propulsé par
              l&apos;IA. La présente politique explique quelles données nous
              collectons, pourquoi et comment nous les utilisons, ainsi que vos
              droits en tant qu&apos;utilisateur.
            </p>
            <p className="mt-3">
              En utilisant Skalle, vous acceptez les pratiques décrites
              ci-dessous. Si vous n&apos;êtes pas d&apos;accord, veuillez ne
              pas utiliser nos services.
            </p>
          </Section>

          {/* Data collected */}
          <Section title="2. Données collectées">
            <Subsection title="2.1 Données de compte">
              <ul className="list-disc list-inside space-y-1">
                <li>Adresse e-mail, nom et mot de passe (hashé)</li>
                <li>
                  Informations de profil issues de connexions tierces (Google,
                  GitHub, Facebook) : nom, e-mail, photo de profil, identifiant
                  du fournisseur
                </li>
                <li>Plan d&apos;abonnement et date d&apos;inscription</li>
              </ul>
            </Subsection>

            <Subsection title="2.2 Données d'espace de travail">
              <ul className="list-disc list-inside space-y-1">
                <li>URL de site web, nom de l&apos;entreprise, secteur</li>
                <li>
                  Contenus générés : articles SEO, publications sociales,
                  messages de prospection
                </li>
                <li>
                  Données prospects : noms, e-mails, profils LinkedIn,
                  entreprises
                </li>
                <li>Mots-clés SEO, analyses de concurrents</li>
                <li>
                  Métriques d&apos;utilisation des agents IA (coûts, tokens,
                  décisions)
                </li>
              </ul>
            </Subsection>

            <Subsection title="2.3 Données d'usage">
              <ul className="list-disc list-inside space-y-1">
                <li>Logs d&apos;actions (pages visitées, features utilisées)</li>
                <li>Adresse IP, type de navigateur, langue</li>
                <li>
                  Tokens d&apos;authentification et sessions (stockés côté
                  serveur via JWT)
                </li>
              </ul>
            </Subsection>

            <Subsection title="2.4 Extension Chrome">
              <p>
                Si vous utilisez notre extension Chrome, nous collectons les
                tokens d&apos;accès Facebook que vous fournissez
                volontairement pour l&apos;import de membres de groupes. Ces
                tokens sont stockés de façon chiffrée et ne sont utilisés
                qu&apos;à votre demande explicite.
              </p>
            </Subsection>
          </Section>

          {/* Why */}
          <Section title="3. Finalités du traitement">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="pb-2 pr-4 font-medium">Finalité</th>
                  <th className="pb-2 font-medium">Base légale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {[
                  ["Fournir et améliorer les services", "Exécution du contrat"],
                  ["Authentification et sécurité", "Exécution du contrat"],
                  [
                    "Génération de contenu IA (SEO, social, prospection)",
                    "Exécution du contrat",
                  ],
                  [
                    "Envoi d'e-mails transactionnels et notifications",
                    "Exécution du contrat",
                  ],
                  [
                    "Analyses d'usage et amélioration du produit",
                    "Intérêt légitime",
                  ],
                  [
                    "Conformité légale et prévention de la fraude",
                    "Obligation légale",
                  ],
                  [
                    "Communications marketing (avec consentement)",
                    "Consentement",
                  ],
                ].map(([purpose, basis]) => (
                  <tr key={purpose}>
                    <td className="py-2 pr-4 text-slate-300">{purpose}</td>
                    <td className="py-2 text-slate-400">{basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* Third parties */}
          <Section title="4. Partage avec des tiers">
            <p className="mb-4">
              Nous ne vendons pas vos données. Nous les partageons uniquement
              avec les sous-traitants nécessaires à la fourniture du service :
            </p>
            <ul className="space-y-2">
              {[
                {
                  name: "Supabase (PostgreSQL)",
                  role: "Hébergement de la base de données",
                  region: "EU West (AWS)",
                },
                {
                  name: "Upstash Redis",
                  role: "Rate limiting & cache",
                  region: "EU",
                },
                {
                  name: "Anthropic (Claude)",
                  role: "Génération de contenu IA",
                  region: "USA",
                },
                {
                  name: "OpenAI (GPT-4o-mini)",
                  role: "Agents SEO & Discovery",
                  region: "USA",
                },
                {
                  name: "Inngest",
                  role: "Orchestration de tâches background",
                  region: "USA",
                },
                {
                  name: "Vercel",
                  role: "Hébergement et déploiement",
                  region: "EU / USA",
                },
              ].map(({ name, role, region }) => (
                <li
                  key={name}
                  className="flex items-start gap-3 bg-slate-900 rounded-lg px-4 py-3"
                >
                  <span className="text-white font-medium min-w-[180px]">
                    {name}
                  </span>
                  <span className="text-slate-400 flex-1">{role}</span>
                  <span className="text-slate-500 text-xs whitespace-nowrap">
                    {region}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-slate-400">
              Les transferts vers les USA sont encadrés par les clauses
              contractuelles types (CCT) de la Commission européenne et/ou le
              Data Privacy Framework (DPF).
            </p>
          </Section>

          {/* Retention */}
          <Section title="5. Durée de conservation">
            <ul className="list-disc list-inside space-y-1">
              <li>
                Données de compte : durée de la relation contractuelle + 3 ans
              </li>
              <li>
                Contenus générés (SEO, social, prospects) : durée du compte
                actif
              </li>
              <li>Logs d&apos;accès : 12 mois glissants</li>
              <li>
                Tokens d&apos;extension Chrome : supprimés à la révocation ou
                clôture du compte
              </li>
              <li>
                Données de facturation : 10 ans (obligation comptable légale)
              </li>
            </ul>
          </Section>

          {/* Security */}
          <Section title="6. Sécurité">
            <p>
              Nous mettons en œuvre des mesures techniques et organisationnelles
              appropriées : chiffrement des données en transit (TLS 1.3),
              mots de passe hashés (bcrypt), rate limiting, vérification HMAC
              des webhooks, isolation des espaces de travail et contrôle
              d&apos;accès basé sur les rôles.
            </p>
            <p className="mt-3">
              En cas de violation de données susceptible d&apos;engendrer un
              risque pour vos droits, nous vous en informerons dans les 72 h
              conformément au RGPD.
            </p>
          </Section>

          {/* Cookies */}
          <Section title="7. Cookies et traceurs">
            <p>Nous utilisons uniquement des cookies strictement nécessaires :</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                Cookie de session NextAuth (<code className="text-slate-300">next-auth.session-token</code>) — authentification
              </li>
              <li>
                Cookie CSRF (<code className="text-slate-300">next-auth.csrf-token</code>) — protection CSRF
              </li>
            </ul>
            <p className="mt-3">
              Aucun cookie publicitaire ou de tracking tiers n&apos;est déposé.
            </p>
          </Section>

          {/* Rights */}
          <Section title="8. Vos droits (RGPD)">
            <p className="mb-3">
              Conformément au Règlement Général sur la Protection des Données
              (RGPD), vous disposez des droits suivants :
            </p>
            <ul className="space-y-2">
              {[
                ["Accès", "Obtenir une copie de vos données personnelles"],
                ["Rectification", "Corriger des données inexactes"],
                [
                  "Effacement",
                  "Demander la suppression de votre compte et données",
                ],
                [
                  "Portabilité",
                  "Recevoir vos données dans un format structuré",
                ],
                [
                  "Opposition",
                  "Vous opposer à un traitement fondé sur l'intérêt légitime",
                ],
                [
                  "Limitation",
                  "Restreindre le traitement dans certaines circonstances",
                ],
                [
                  "Retrait du consentement",
                  "À tout moment pour les traitements fondés sur le consentement",
                ],
              ].map(([right, desc]) => (
                <li key={right} className="flex gap-3">
                  <span className="text-white font-medium min-w-[160px]">
                    {right}
                  </span>
                  <span className="text-slate-400">{desc}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4">
              Pour exercer ces droits, contactez-nous à{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-white underline hover:text-slate-300"
              >
                {CONTACT_EMAIL}
              </a>
              . Nous répondrons dans un délai de 30 jours. Vous avez également
              le droit d&apos;introduire une réclamation auprès de la{" "}
              <a
                href="https://www.cnil.fr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline hover:text-slate-300"
              >
                CNIL
              </a>
              .
            </p>
          </Section>

          {/* Meta / Facebook */}
          <Section title="9. Utilisation des données Meta (Facebook)">
            <p className="mb-3">
              Skalle utilise les API Meta dans le cadre de fonctionnalités
              spécifiques (connexion Facebook, extension Chrome d&apos;import de
              membres). Cette section est conforme aux{" "}
              <a
                href="https://developers.facebook.com/policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline hover:text-slate-300"
              >
                Politiques de la plateforme Meta
              </a>
              .
            </p>

            <Subsection title="9.1 Données Meta collectées">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  Identifiant utilisateur Facebook, nom et adresse e-mail (via
                  Facebook Login)
                </li>
                <li>
                  Membres de groupes Facebook (noms, profils publics) — uniquement
                  lors d&apos;un import manuel via l&apos;extension Chrome
                </li>
                <li>
                  Token d&apos;accès à l&apos;API Graph fourni volontairement
                </li>
              </ul>
            </Subsection>

            <Subsection title="9.2 Utilisation des données Meta">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  Les données Meta sont utilisées <strong>uniquement</strong>{" "}
                  pour fournir les fonctionnalités demandées par l&apos;utilisateur
                  (authentification, import de prospects)
                </li>
                <li>
                  Nous ne partageons pas les données Meta avec des tiers à des
                  fins publicitaires
                </li>
                <li>
                  Nous ne vendons, ne louons, ni ne transférons les données Meta
                  à des courtiers en données
                </li>
                <li>
                  Les tokens d&apos;accès sont stockés de façon chiffrée et
                  révoqués à la demande ou à la clôture du compte
                </li>
              </ul>
            </Subsection>

            <Subsection title="9.3 Suppression des données utilisateur Meta">
              <p>
                Conformément aux exigences Meta, vous pouvez demander la
                suppression de toutes les données issues de Meta en :
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>
                  Utilisant le lien de suppression de données disponible dans
                  les paramètres de votre compte Facebook (
                  <em>Paramètres → Applications et sites web → Skalle → Supprimer</em>
                  )
                </li>
                <li>
                  Envoyant une demande à{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="text-white underline hover:text-slate-300"
                  >
                    {CONTACT_EMAIL}
                  </a>{" "}
                  avec l&apos;objet &quot;Suppression données Meta&quot;
                </li>
              </ul>
              <p className="mt-3">
                Nous traiterons votre demande dans un délai de{" "}
                <strong>30 jours</strong> et supprimerons l&apos;ensemble des
                données associées à votre compte Meta.
              </p>
            </Subsection>
          </Section>

          {/* Children */}
          <Section title="10. Mineurs">
            <p>
              Skalle est destiné aux professionnels et entreprises. Nous ne
              collectons pas sciemment de données relatives à des personnes de
              moins de 16 ans. Si vous pensez qu&apos;un mineur a créé un
              compte, contactez-nous immédiatement.
            </p>
          </Section>

          {/* Changes */}
          <Section title="11. Modifications">
            <p>
              Nous pouvons mettre à jour cette politique. En cas de changement
              substantiel, nous vous en informerons par e-mail et/ou via une
              notification dans l&apos;application au moins 14 jours avant
              l&apos;entrée en vigueur. La date de dernière mise à jour figure
              en haut de ce document.
            </p>
          </Section>

          {/* Contact */}
          <Section title="12. Contact">
            <p>
              Pour toute question relative à cette politique ou à vos données :
            </p>
            <div className="mt-3 bg-slate-900 rounded-lg px-4 py-4 space-y-1 text-sm">
              <p>
                <span className="text-slate-400">Responsable du traitement :</span>{" "}
                {COMPANY_NAME}
              </p>
              <p>
                <span className="text-slate-400">E-mail :</span>{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-white hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-white mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Subsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-medium text-slate-200 mb-2">{title}</h3>
      {children}
    </div>
  );
}
