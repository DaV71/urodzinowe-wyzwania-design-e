// Podgląd komponentów bazowych (tylko development). W produkcji zwraca 404.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { site } from "@/config/site";
import { Cake } from "@/components/Cake";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { IconCheck, IconDumbbell, IconGift, IconLock } from "@/components/icons";
import { ProgressPill } from "@/components/ProgressPill";
import { StageHeader } from "@/components/StageHeader";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Podgląd komponentów",
  robots: { index: false, follow: false },
};

const states = [0, 5, 28];

const section: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 28,
  maxWidth: 520,
  margin: "0 auto",
  padding: "0 20px 48px",
  borderBottom: "3px dashed var(--locked)",
};

const caption: React.CSSProperties = {
  margin: "32px 0 0",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "var(--muted)",
};

export default function PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main>
      {states.map((done) => (
        <section key={done} style={section} aria-label={`Stan: ${done} zaliczonych`}>
          <p style={caption}>Stan: done = {done}</p>
          <TopBar dateLabel={site.dateLabel} />
          <div>
            <Cake done={done} total={site.totalTasks} age={site.age} />
            <ProgressPill done={done} total={site.totalTasks} />
          </div>
          <Hero name={site.name} total={site.totalTasks} />
          <div>
            {site.stages.map((name, i) => (
              <StageHeader key={name} index={i + 1} name={name} />
            ))}
          </div>
          <Footer from={site.from} />
        </section>
      ))}

      <section style={section} aria-label="Ikony">
        <p style={caption}>Ikony</p>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <IconCheck size={20} />
          <IconDumbbell size={24} />
          <IconLock size={16} strokeWidth={2.5} />
          <IconGift size={56} />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 999,
              background: "var(--ink)",
              color: "var(--yellow)",
            }}
          >
            <IconCheck size={20} />
          </span>
          <IconLock size={28} color="var(--accent)" />
        </div>
      </section>
    </main>
  );
}
