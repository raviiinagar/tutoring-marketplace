import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, GraduationCap, Atom, BriefcaseBusiness, Languages, Palette, Sparkles, Heart, Search, Compass, ChevronRight } from "lucide-react";
import { SiteHeader } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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

const subjects = [
  { name: "School education", category: "Academic", detail: "Confidence starts with the basics.", topics: "Mathematics · Science · English", icon: BookOpen, color: "bg-secondary" },
  { name: "JEE & NEET", category: "Exams", detail: "Make space for your biggest goals.", topics: "Physics · Chemistry · Biology", icon: Atom, color: "bg-accent" },
  { name: "Higher education", category: "Academic", detail: "Turn questions into understanding.", topics: "University · Core concepts", icon: GraduationCap, color: "bg-sky" },
  { name: "Competitive exams", category: "Exams", detail: "A fresh focus for your next step.", topics: "Aptitude · Reasoning · General studies", icon: Compass, color: "bg-sunshine" },
  { name: "Career & qualifications", category: "Skills", detail: "Grow beyond what you know.", topics: "Career skills · Professional learning", icon: BriefcaseBusiness, color: "bg-sunshine" },
  { name: "Languages", category: "Skills", detail: "A new language. A new world.", topics: "English · Hindi · More languages", icon: Languages, color: "bg-secondary" },
  { name: "Arts & creativity", category: "Skills", detail: "Let your imagination take the lead.", topics: "Art · Music · Creative exploration", icon: Palette, color: "bg-accent" },
  { name: "Something new", category: "Skills", detail: "There's always more to discover.", topics: "New interests · Lifelong learning", icon: Sparkles, color: "bg-sky" },
];
const filters = ["All subjects", "Academic", "Exams", "Skills"];

function Index() {
  const [filter, setFilter] = useState("All subjects");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<(typeof subjects)[number] | null>(null);
  const visible = subjects.filter(s => (filter === "All subjects" || s.category === filter) && `${s.name} ${s.topics}`.toLowerCase().includes(query.toLowerCase().trim()));
  const explore = (value: string) => {
    setQuery(value); setDraft(value); setFilter("All subjects");
    document.getElementById("subjects")?.scrollIntoView({ block: "start" });
  };
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="community-hero relative isolate overflow-hidden bg-hero-surface">
          <img src={communityPhoto} alt="A tutor and two young adults sharing a notebook and a smile" width={1536} height={1024} fetchPriority="high" className="community-photo absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="hero-inner mx-auto max-w-7xl px-5 lg:px-8">
            <div className="animate-rise max-w-[520px]">
              <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase"><span className="h-2 w-2 rounded-full bg-coral-strong" /> Big dreams start with a little help</p>
              <h1 className="text-5xl font-semibold leading-[1.04] sm:text-6xl">Tutor<br />Marketplace<span className="text-coral-strong">.</span></h1>
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
          </div>
        </section>
        <section aria-label="Our community" className="border-b bg-card">
          <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 sm:grid-cols-3 lg:px-8">
            {[{icon: Heart, title: "A more human way to learn", text: "Encouragement makes all the difference."}, {icon: Compass, title: "Every goal belongs here", text: "From your first question to your next big leap."}, {icon: Sparkles, title: "Share what you love", text: "For curious learners and inspiring tutors."}].map(item => <div key={item.title} className="flex items-center gap-3"><item.icon className="size-5 shrink-0 text-coral-strong" /><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.text}</p></div></div>)}
          </div>
        </section>
        <section id="subjects" aria-labelledby="subjects-title" className="mx-auto max-w-7xl scroll-mt-6 px-5 py-12 lg:px-8 lg:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="mb-2 text-xs font-semibold uppercase text-coral-strong">Follow your curiosity</p><h2 id="subjects-title" className="text-3xl font-semibold sm:text-4xl">One interest. Endless possibilities.</h2><p className="mt-3 text-sm text-muted-foreground">Discover the learning areas we're preparing for.</p></div>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="size-1.5 rounded-full bg-mint" /> Planned subjects</span>
          </div>
          <div className="my-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div aria-label="Filter subjects" className="flex flex-wrap gap-1">{filters.map(f => <Button key={f} variant="ghost" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`h-10 px-4 ${filter === f ? "bg-foreground text-background hover:bg-foreground/90 hover:text-background" : "text-muted-foreground"}`}>{f}</Button>)}</div>
            {query && <Button variant="outline" onClick={() => { setQuery(""); setDraft(""); }} className="max-w-full whitespace-normal text-sm">{query} <span aria-hidden>×</span><span className="sr-only">Clear search</span></Button>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visible.map(s => <Button key={s.name} variant="outline" onClick={() => setSelected(s)} className="subject-card relative flex h-auto min-h-44 flex-col items-start justify-start whitespace-normal rounded-lg border-border bg-card p-5 text-left shadow-none hover:bg-card hover:text-foreground">
              <span className={`mb-4 grid size-10 place-items-center rounded-lg ${s.color}`}><s.icon className="size-5" /></span><ArrowUpRight aria-hidden className="absolute right-5 top-6 size-4 text-muted-foreground" />
              <span className="font-display text-lg font-semibold">{s.name}</span><span className="mt-1 text-xs font-normal leading-relaxed text-muted-foreground">{s.topics}</span>
            </Button>)}
          </div>
          <p role="status" className="mt-4 text-xs text-muted-foreground">{query ? `${visible.length} planned learning ${visible.length === 1 ? "area" : "areas"} for “${query}”` : "For the school days, the big exams, and everything beyond."}</p>
          {visible.length === 0 && <div className="py-8 text-center"><p className="font-display text-xl">A different spark, perhaps?</p><p className="mt-2 text-sm text-muted-foreground">No matching subjects yet. Try another interest.</p><Button variant="link" onClick={() => {setQuery(""); setDraft(""); setFilter("All subjects");}}>View all subjects</Button></div>}
        </section>
        <section id="tutors" className="scroll-mt-6 bg-secondary">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-12 md:grid-cols-2 lg:gap-16 lg:px-8 lg:py-16">
            <img src={learningPhoto} alt="Young people learning together in a bright library" width={1536} height={1024} loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover object-right" />
            <div className="max-w-lg"><p className="mb-3 text-xs font-semibold uppercase text-success">For tutors</p><h2 className="text-3xl font-semibold leading-tight sm:text-4xl">Someone out there<br />could learn so much<br />from you.</h2><p className="mt-5 text-sm leading-relaxed text-secondary-foreground">The way you explain it. The patience you bring. That moment you make it click. Your knowledge could be someone's new beginning.</p><p className="mt-3 text-sm leading-relaxed text-secondary-foreground">Create your account as we build our teaching community.</p><Button asChild className="mt-6 h-12 bg-foreground px-6 font-semibold text-background hover:bg-foreground/90"><Link to="/auth/signup">Join as a tutor <ArrowUpRight /></Link></Button></div>
          </div>
        </section>
        <section className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-12 lg:px-8"><div><h2 className="text-3xl font-semibold">A new chapter starts with you.</h2><p className="mt-2 text-sm text-muted-foreground">Student or tutor, there's room for you here.</p></div><Button asChild className="h-12 px-6 font-semibold"><Link to="/auth/signup">Create your account <ChevronRight /></Link></Button></section>
      </main>
      <footer className="border-t"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center lg:px-8"><Link to="/" className="font-display text-base font-semibold text-foreground">Tutor Marketplace<span className="text-coral-strong">.</span></Link><p>Made for curious minds across India.</p><Link to="/auth/signin" className="hover:text-foreground">Already a member? Sign in <span aria-hidden>↗</span></Link></div></footer>
      <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">{selected && <><span className={`grid size-12 place-items-center rounded-lg ${selected.color}`}><selected.icon /></span><DialogTitle className="font-display text-2xl">{selected.name}</DialogTitle><DialogDescription className="leading-relaxed">{selected.topics}</DialogDescription><p className="font-display text-lg">{selected.detail}</p><p className="text-sm leading-relaxed text-muted-foreground">This is a planned learning area. Tutor discovery is coming soon; no tutors are available to book here yet.</p><Button asChild className="mt-2 h-12"><Link to="/auth/signup">Create your account <ArrowUpRight /></Link></Button></>}</DialogContent></Dialog>
    </div>
  );
}
