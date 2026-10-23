import { LoginForm } from '@/components/LoginForm';
import { RegMark } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const demo = process.env.DEMO_MODE !== 'false';
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-12 px-5 py-12 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="flex items-center gap-2.5"><RegMark size={26} /><span className="text-xl font-bold tracking-tight">BrandProof</span></div>
        <h1 className="mt-8 max-w-xl text-4xl font-bold leading-[1.1] tracking-tight">Every flag shows its evidence. Every approval has a name on it.</h1>
        <p className="mt-4 max-w-lg text-ink-2">
          BrandProof checks copy against your approved brand rules and facts before it goes out. A finding only appears if it quotes the draft and cites the brand guide, and a person decides what ships.
        </p>
        <div className="crop mt-8 max-w-lg" aria-hidden>
          <div className="sheet p-6 font-serif text-[1.05rem] leading-8">
            Our <mark className="pen pen-minor">CHEAP BEANS</mark> are the <mark className="pen pen-major">#1</mark> coffee in town, <mark className="pen pen-critical">guaranteed</mark>.
          </div>
        </div>
        <p className="mt-3 max-w-lg text-sm text-ink-2">Magenta marks a critical claim, yellow a major one, cyan a minor one.</p>
      </div>
      <div className="rounded-lg border border-line bg-white p-6"><LoginForm demo={demo} /></div>
    </main>
  );
}
