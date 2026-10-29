import Link from 'next/link';
import Logo from '@/components/Logo';

const points = [
  ['Shopify', 'Answers product, price and stock questions from your live catalogue, and checks order status only after the customer verifies their order number and email.'],
  ['Your documents', 'Upload PDFs, Word files or text, or point it at your website. Answers come from your content, with the source named.'],
  ['Your instructions', 'Set the role, tone and limits. When it does not know, it says so and hands over to your team.'],
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link href="/login" className="px-3 py-2">Sign in</Link>
          <Link href="/signup" className="btn-primary">Start free</Link>
        </nav>
      </header>
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-16">
        <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">Support chat that answers from what you actually sell and write.</h1>
        <p className="mt-6 max-w-xl text-lg text-ink/70">Connect Shopify, add your documents, set your rules. Test it in the playground, publish, and paste one line of code on your site.</p>
        <div className="mt-8 flex gap-3"><Link href="/signup" className="btn-primary px-5 py-3">Create your assistant</Link><Link href="/login" className="btn-ghost px-5 py-3">Sign in</Link></div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 md:grid-cols-3">
        {points.map(([t, d]) => (
          <div key={t} className="card p-5"><h2 className="font-bold">{t}</h2><p className="mt-2 text-sm text-ink/70">{d}</p></div>
        ))}
      </section>
    </main>
  );
}
