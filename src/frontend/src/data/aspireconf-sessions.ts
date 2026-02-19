import type { Props as SessionProps } from '@components/SessionCard.astro';

// Import speaker headshots, e.g.:
import pinePic from '../assets/aspireconf/pine.webp';
import ayersPic from '../assets/aspireconf/chrisayers.jpg';

export const sessions: SessionProps[] = [
  {
    title: 'From Localhost to Liftoff: Aspire for Newbies',
    speakers: [
      { name: 'David Pine', headshot: pinePic, jobTitle: 'Senior Software Engineer', company: 'Aspire @ Microsoft' },
      { name: 'Claudia Regio', headshot: pinePic, jobTitle: 'Senior Product Manager', company: 'Dev Tools @ Microsoft' },
    ],
    abstract: 'What happens when you learn Aspire alongside someone seeing it for the first time? David walks Claudia through a live, beginner-friendly tour — from localhost to the cloud. Expect real questions, clear explanations, and a fresh look at how Aspire handles orchestration, observability, and service composition today. Whether you’re new or catching up, you’ll leave with a simple mental model and a clear way to explain Aspire to your team.',
    // timeslot: '9:00 AM PT',
  },
  {
    title: 'One AppHost, Many Languages',
    speakers: [
      { name: 'Chris Ayers', headshot: ayersPic, jobTitle: 'Principal Software Engineer', company: 'Azure @ Microsoft' },
    ],
    abstract: 'Aspire makes polyglot systems feel like one product by letting you run and wire everything through a single AppHost. Chris will show some popular patterns - like a Go backend + Vite frontend, Python API + JS frontend, Spring Boot with PostgreSQL, and C# API with CosmosDB. You’ll see the same repeatable workflow for local dev, service discovery, and config across Python, TypeScript, Go, Java, and .NET, without the usual chaotic repo setup and onboarding.',
    // timeslot: '9:00 AM PT',
  },
  
];
