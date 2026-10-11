import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Sparkles, Heart, Search, Compass, ChevronRight } from "lucide-react";
import { SiteHeader, BrandWordmark } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { CatalogueBrowser } from "@/components/catalogue-browser";
import { Reveal } from "@/components/reveal";
import communityPhoto from "@/assets/learning-community.jpg";
import learningPhoto from "@/assets/learning-together.jpg";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Tutor Marketplace — Discover your next learning chapter" },
    { name: "description", content: "Explore planned subjects from maths and science to languages and creative skills. Create your Tutor Marketplace account as a learner or tutor in India." },
    { property: "og:title", content: "Tutor Marketplace — Discover your next learning chapter" },
    { property: "og:description", content: "A welcoming community for curious learners and inspiring tutors in India. Explore planned subjects and join the journey." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Index,
});

function Index() {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const explore = (value: string) => {
    setQuery(value); setDraft(value);
    document.getElementById("subjects")?.scrollIntoView({ block: "start" });
  };
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="community-hero relative isolate overflow-hidden bg-hero-surface">
          <div aria-hidden="true" className="hero-orb hero-orb-coral" />
          <div aria-hidden="true" className="hero-orb hero-orb-mint" />
          <img src={communityPhoto} alt="A tutor and two young adults sharing a notebook and a smile" width={1536} height={1024} fetchPriority="high" className="community-photo absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="hero-inner mx-auto max-w-7xl px-5 lg:px-8">
            <div className="hero-copy max-w-[520px]">
              <p className="hero-eyebrow mb-5 flex items-center gap-2 text-xs font-semibold uppercase"><span className="h-2 w-2 rounded-full bg-coral-strong" /> Big dreams start with a little help</p>
              <h1 className="hero-title text-5xl font-semibold leading-[1.04] sm:text-6xl"><span>Tutor</span><br /><span className="hero-title-accent">Marketplace<span className="text-coral-strong">.</span></span></h1>
              <p className="mt-5 font-display text-2xl font-medium leading-snug">Your next “I get it!” starts here.</p>
              <p className="mt-3 max-w-sm text-base leading-relaxed text-muted-foreground">A world of subjects. A place for your ambition.<br className="hidden sm:block" /> Let's find what sparks your curiosity.</p>
              <form onSubmit={e => { e.preventDefault(); explore(draft); }} className="subject-search mt-7 flex items-center gap-2 rounded-lg border border-background bg-card p-2">
                <Search aria-hidden className="ml-2 size-5 shrink-0 text-muted-foreground" />
                <input aria-label="What would you like to learn?" placeholder="What would you like to learn?" value={draft} onChange={e => setDraft(e.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" />
                <Button type="submit" className="h-12 shrink-0 gap-2 px-5 font-semibold"><span className="hidden sm:inline">Explore</span><ArrowRight className="size-4" /><span className="sr-only sm:hidden">Explore subjects</span></Button>
              </form>
              <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-0 text-xs"><span className="mr-1 text-muted-foreground">Try:</span>{["Mathematics", "English", "Music"].map(topic => <Button key={topic} variant="ghost" onClick={() => explore(topic)} className="h-8 px-2 text-xs font-medium underline decoration-foreground/25 underline-offset-4 hover:bg-background/40">{topic}</Button>)}</div>
              <p className="mt-3 text-xs text-muted-foreground">Join today · Tutor discovery is coming soon</p>
            </div>
            <div aria-hidden="true" className="hero-note hero-note-top"><span className="hero-note-icon"><Sparkles /></span><div><strong>Your next chapter</strong><span>A little curiosity goes a long way.</span></div></div>
            <div aria-hidden="true" className="hero-note hero-note-bottom"><span className="hero-note-icon"><Compass /></span><div><strong>Find your spark</strong><span>Eight worlds of learning to explore.</span></div></div>
          </div>
        </section>
        <section aria-label="Our community" className="border-b bg-card">
          <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 sm:grid-cols-3 lg:px-8">
            {[{icon: Heart, title: "A more human way to learn", text: "Encouragement makes all the difference."}, {icon: Compass, title: "Every goal belongs here", text: "From your first question to your next big leap."}, {icon: Sparkles, title: "Share what you love", text: "For curious learners and inspiring tutors."}].map((item,index) => <Reveal key={item.title} delay={index*90} className="flex items-center gap-3"><span className="community-icon"><item.icon className="size-5 shrink-0 text-coral-strong" /></span><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.text}</p></div></Reveal>)}
          </div>
        </section>
        <CatalogueBrowser query={query} clearSearch={() => {setQuery("");setDraft("");}} />
        <section id="tutors" className="scroll-mt-6 bg-secondary">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-12 md:grid-cols-2 lg:gap-16 lg:px-8 lg:py-16">
            <Reveal className="tutor-photo-wrap"><img src={learningPhoto} alt="Young people learning together in a bright library" width={1536} height={1024} loading="lazy" className="tutor-photo aspect-[4/3] w-full rounded-2xl object-cover object-right" /></Reveal>
            <div className="max-w-lg"><p className="mb-3 text-xs font-semibold uppercase text-success">For tutors</p><h2 className="text-3xl font-semibold leading-tight sm:text-4xl">Someone out there<br />could learn so much<br />from you.</h2><p className="mt-5 text-sm leading-relaxed text-secondary-foreground">The way you explain it. The patience you bring. That moment you make it click. Your knowledge could be someone's new beginning.</p><p className="mt-3 text-sm leading-relaxed text-secondary-foreground">Create your account as we build our teaching community.</p><Button asChild className="mt-6 h-12 bg-foreground px-6 font-semibold text-background hover:bg-foreground/90"><Link to="/auth/signup">Join as a tutor <ArrowUpRight /></Link></Button></div>
          </div>
        </section>
        <section className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-12 lg:px-8"><div><h2 className="text-3xl font-semibold">A new chapter starts with you.</h2><p className="mt-2 text-sm text-muted-foreground">Student or tutor, there's room for you here.</p></div><Button asChild className="h-12 px-6 font-semibold"><Link to="/auth/signup">Create your account <ChevronRight /></Link></Button></section>
      </main>
      <footer className="border-t"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center lg:px-8"><Link to="/" aria-label="Tutor Marketplace home" className="brand-link"><BrandWordmark className="brand-wordmark-footer" /></Link><p>Made for curious minds across India.</p><Link to="/auth/signin" className="hover:text-foreground">Already a member? Sign in <span aria-hidden>↗</span></Link></div></footer>

    </div>
  );
}
