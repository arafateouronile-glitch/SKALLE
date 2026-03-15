import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Conditions Générales d'Utilisation — Skalle",
  description:
    "Les conditions régissant l'accès et l'utilisation de la plateforme Skalle.",
};

const LAST_UPDATED = "15 mars 2026";
const CONTACT_EMAIL = "legal@skalle.io";
const COMPANY_NAME = "Skalle";

export default function CguPage() {
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
            Conditions Générales d&apos;Utilisation
          </h1>
          <p className="text-slate-400 text-sm">
            Dernière mise à jour : {LAST_UPDATED}
          </p>
        </div>

        {/* Content */}
        <div className="space-y-10 text-slate-300 leading-relaxed">

          {/* Intro */}
          <Section title="1. Présentation">
            <p>
              {COMPANY_NAME} (&quot;nous&quot;, &quot;notre&quot;) édite une
              plateforme SaaS de marketing et de développement commercial
              propulsée par l&apos;intelligence artificielle (le
              &quot;Service&quot;). Les présentes Conditions Générales
              d&apos;Utilisation (&quot;CGU&quot;) régissent l&apos;accès et
              l&apos;utilisation du Service par tout utilisateur
              (&quot;vous&quot;).
            </p>
            <p className="mt-3">
              En créant un compte ou en utilisant le Service, vous acceptez sans
              réserve les présentes CGU. Si vous agissez au nom d&apos;une
              entreprise, vous déclarez avoir le pouvoir de l&apos;engager.
            </p>
          </Section>

          {/* Access */}
          <Section title="2. Accès au Service">
            <Subsection title="2.1 Création de compte">
              <p>
                L&apos;accès au Service nécessite la création d&apos;un compte.
                Vous devez fournir des informations exactes et les maintenir à
                jour. Vous êtes responsable de la confidentialité de vos
                identifiants et de toute activité effectuée depuis votre compte.
              </p>
            </Subsection>

            <Subsection title="2.2 Conditions d'éligibilité">
              <ul className="list-disc list-inside space-y-1">
                <li>Être âgé d&apos;au moins 16 ans</li>
                <li>
                  Ne pas avoir fait l&apos;objet d&apos;une suspension ou
                  résiliation antérieure de compte Skalle
                </li>
                <li>
                  Utiliser le Service à des fins professionnelles ou
                  commerciales légitimes
                </li>
              </ul>
            </Subsection>

            <Subsection title="2.3 Plans et crédits">
              <p>
                Le Service est proposé selon plusieurs plans tarifaires (Free,
                Business, Agency, Scale) détaillés sur la page{" "}
                <Link href="/pricing" className="text-white underline hover:text-slate-300">
                  Tarification
                </Link>
                . Certaines fonctionnalités consomment des crédits IA. Les
                crédits non utilisés en fin de période ne sont pas reportés sauf
                mention contraire dans votre plan.
              </p>
            </Subsection>
          </Section>

          {/* Use */}
          <Section title="3. Utilisation acceptable">
            <p className="mb-3">
              Vous vous engagez à utiliser le Service de manière légale et
              éthique. Sont notamment interdits :
            </p>
            <ul className="space-y-2">
              {[
                "Générer ou diffuser du contenu illégal, trompeur, diffamatoire, harcelant ou discriminatoire",
                "Contourner les limites d'utilisation (rate limits, quotas de crédits)",
                "Revendre, louer ou sous-licencier l'accès au Service sans autorisation écrite",
                "Utiliser le Service pour envoyer des communications non sollicitées (spam) en violation des lois applicables (RGPD, CAN-SPAM, etc.)",
                "Tenter d'accéder à des comptes ou données d'autres utilisateurs",
                "Automatiser des actions sur des plateformes tierces en violation de leurs CGU (LinkedIn, Facebook, etc.)",
                "Reverse-engineering, décompilation ou extraction du code source du Service",
                "Utiliser le Service pour former des modèles d'IA concurrents",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="text-slate-500 mt-0.5">✗</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Content */}
          <Section title="4. Contenu utilisateur">
            <Subsection title="4.1 Propriété">
              <p>
                Vous conservez l&apos;ensemble des droits sur les données et
                contenus que vous importez ou créez via le Service (données
                prospects, textes, fichiers). Vous nous accordez une licence
                limitée, non exclusive et révocable pour traiter ces contenus
                aux seules fins de fournir le Service.
              </p>
            </Subsection>

            <Subsection title="4.2 Responsabilité">
              <p>
                Vous êtes seul responsable de la légalité et de l&apos;exactitude
                des contenus que vous importez ou publiez via le Service,
                notamment des listes de prospects et des messages envoyés en
                votre nom. Skalle ne saurait être tenu responsable de
                l&apos;usage que vous faites des contenus générés par
                l&apos;IA.
              </p>
            </Subsection>

            <Subsection title="4.3 Contenus générés par l'IA">
              <p>
                Les contenus produits par les agents IA de Skalle (articles SEO,
                publications sociales, messages de prospection) sont fournis à
                titre d&apos;assistance. Nous ne garantissons pas leur exactitude,
                leur originalité ni leur conformité à des réglementations
                sectorielles spécifiques. Il vous appartient de les vérifier
                avant publication ou envoi.
              </p>
            </Subsection>
          </Section>

          {/* IP */}
          <Section title="5. Propriété intellectuelle">
            <p>
              Le Service, son interface, ses algorithmes, ses marques et logos
              sont la propriété exclusive de {COMPANY_NAME} ou de ses
              concédants. Les présentes CGU ne vous transfèrent aucun droit de
              propriété intellectuelle sur le Service.
            </p>
            <p className="mt-3">
              Toute reproduction, représentation ou exploitation non autorisée
              du Service est strictement interdite et peut engager votre
              responsabilité civile et pénale.
            </p>
          </Section>

          {/* Billing */}
          <Section title="6. Facturation et paiement">
            <Subsection title="6.1 Prix">
              <p>
                Les prix sont indiqués en euros, hors taxes, sur la page{" "}
                <Link href="/pricing" className="text-white underline hover:text-slate-300">
                  Tarification
                </Link>
                . Nous nous réservons le droit de modifier nos tarifs avec un
                préavis de 30 jours. Les abonnements en cours sont honorés au
                tarif en vigueur jusqu&apos;à leur renouvellement.
              </p>
            </Subsection>

            <Subsection title="6.2 Renouvellement et résiliation">
              <p>
                Les abonnements sont reconduits automatiquement à leur échéance.
                Vous pouvez résilier à tout moment depuis votre espace client.
                La résiliation prend effet à la fin de la période en cours ;
                aucun remboursement au prorata n&apos;est effectué sauf
                obligation légale contraire.
              </p>
            </Subsection>

            <Subsection title="6.3 Impayés">
              <p>
                En cas de défaut de paiement, l&apos;accès au Service peut être
                suspendu après mise en demeure restée sans effet sous 7 jours.
              </p>
            </Subsection>
          </Section>

          {/* SLA */}
          <Section title="7. Disponibilité et maintenance">
            <p>
              Nous nous efforçons de maintenir le Service disponible 24h/24,
              7j/7. Nous ne garantissons cependant pas une disponibilité
              ininterrompue. Des interruptions planifiées (maintenance) ou
              imprévues peuvent survenir. En cas d&apos;indisponibilité
              prolongée imputable à Skalle, des crédits de service peuvent être
              accordés sur demande, sans que cela constitue un droit automatique
              à remboursement.
            </p>
          </Section>

          {/* Liability */}
          <Section title="8. Limitation de responsabilité">
            <p>
              Dans les limites autorisées par la loi applicable, la
              responsabilité de {COMPANY_NAME} est limitée au montant des
              sommes effectivement versées par vous au cours des 12 derniers
              mois précédant le fait générateur.
            </p>
            <p className="mt-3">
              {COMPANY_NAME} ne saurait être tenu responsable de pertes
              indirectes, pertes de données, pertes de revenus, préjudices
              d&apos;image ou préjudices immatériels, même si informé de leur
              possibilité.
            </p>
            <p className="mt-3">
              Nous ne sommes pas responsables des actions entreprises par vous
              sur des plateformes tierces (LinkedIn, Facebook, etc.) à
              l&apos;aide des contenus ou outils générés par le Service.
            </p>
          </Section>

          {/* Suspension */}
          <Section title="9. Suspension et résiliation">
            <Subsection title="9.1 Par Skalle">
              <p>
                Nous pouvons suspendre ou résilier votre accès, sans préavis,
                en cas de violation des présentes CGU, d&apos;activité
                frauduleuse, d&apos;atteinte à la sécurité du Service ou sur
                injonction d&apos;une autorité compétente.
              </p>
            </Subsection>

            <Subsection title="9.2 Par vous">
              <p>
                Vous pouvez supprimer votre compte à tout moment depuis les
                paramètres. La suppression entraîne l&apos;effacement de vos
                données dans les délais prévus par notre{" "}
                <Link href="/privacy" className="text-white underline hover:text-slate-300">
                  Politique de confidentialité
                </Link>
                .
              </p>
            </Subsection>
          </Section>

          {/* Third parties */}
          <Section title="10. Services tiers">
            <p>
              Le Service intègre des outils tiers (OpenAI, Anthropic, Google,
              LinkedIn, Meta, Stripe, etc.). L&apos;utilisation de ces services
              est soumise à leurs propres conditions. Skalle ne saurait être
              tenu responsable des interruptions, modifications ou dysfonctions
              de services tiers.
            </p>
          </Section>

          {/* Changes */}
          <Section title="11. Modifications des CGU">
            <p>
              Nous pouvons modifier les présentes CGU à tout moment. En cas de
              changement substantiel, nous vous en informerons par e-mail et/ou
              via une notification dans l&apos;application au moins 14 jours
              avant l&apos;entrée en vigueur. La poursuite de l&apos;utilisation
              du Service après cette date vaut acceptation des nouvelles
              conditions.
            </p>
          </Section>

          {/* Law */}
          <Section title="12. Droit applicable et juridiction">
            <p>
              Les présentes CGU sont régies par le droit français. En cas de
              litige, et à défaut de résolution amiable dans un délai de 60
              jours, les tribunaux compétents de Paris seront seuls compétents.
            </p>
            <p className="mt-3">
              Conformément aux articles L.616-1 et R.616-1 du Code de la
              consommation, les consommateurs peuvent recourir à la médiation
              conventionnelle ou à tout autre mode alternatif de règlement des
              différends.
            </p>
          </Section>

          {/* Contact */}
          <Section title="13. Contact">
            <p>Pour toute question relative aux présentes CGU :</p>
            <div className="mt-3 bg-slate-900 rounded-lg px-4 py-4 space-y-1 text-sm">
              <p>
                <span className="text-slate-400">Éditeur :</span> {COMPANY_NAME}
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

            <div className="mt-6 pt-6 border-t border-slate-800 flex flex-wrap gap-4 text-sm">
              <Link href="/privacy" className="text-slate-400 hover:text-white transition-colors">
                Politique de confidentialité →
              </Link>
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
