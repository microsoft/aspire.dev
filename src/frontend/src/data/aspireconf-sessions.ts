import type { Props as SessionProps } from '@components/SessionCard.astro';

// Import speaker headshots, e.g.:
import pinePic from '../assets/aspireconf/pine.webp';
import ayersPic from '../assets/aspireconf/chrisayers.jpg';

export const sessions: SessionProps[] = [
  {
    title: 'Keynote: Come Meet the New Aspire',
    speakers: [
      { name: 'Maddy Montaquila', jobTitle: 'Senior Product Manager', company: 'Aspire @ Microsoft' },
      { name: 'Damian Edwards', jobTitle: 'Principal Architect', company: 'Aspire @ Microsoft' },
      { name: 'David Fowler', jobTitle: 'Distinguished Engineer', company: 'Aspire @ Microsoft' },
    ],
    abstract: 'Come meet the new Aspire. Discover how Aspire can transform the way you build and deploy your distributed apps and agents. With code-centric control, orchestrate and observe simple or complex systems with no rewrites, and deploy anywhere.',
    timeslot: '9:00 AM PT',
    duration: '60 min',
    keynote: true,
  },
  {
    title: 'From Localhost to Liftoff: Aspire for Newbies',
    speakers: [
      { name: 'David Pine', headshot: pinePic, jobTitle: 'Senior Software Engineer', company: 'Aspire @ Microsoft' },
      { name: 'Claudia Regio', jobTitle: 'Senior Product Manager', company: 'Dev Tools @ Microsoft' },
    ],
    abstract: 'Aspire makes polyglot systems feel like one product by letting you run and wire everything through a single AppHost. Chris will show some popular patterns - like a Go backend + Vite frontend, Python API + JS frontend, Spring Boot with PostgreSQL, and C# API with CosmosDB. You\'ll see the same repeatable workflow for local dev, service discovery, and config across Python, TypeScript, Go, Java, and .NET, without the usual chaotic repo setup and onboarding.',
    timeslot: '10:00 AM PT',
    duration: '45 min',
  },
  {
    title: 'Aspire for AI Apps',
    speakers: [
      { name: 'Tommaso Stocchi' },
      { name: 'Seth Juarez' },
    ],
    abstract: 'TBD',
    timeslot: '10:45 AM PT',
    duration: '30 min',
  },
  {
    title: 'Aspire at Microsoft',
    speakers: [
      { name: 'Chuanbo Zhang' },
    ],
    abstract: 'TBD',
    timeslot: '11:15 AM PT',
    duration: '30 min',
  },
  {
    title: 'Vibe Coding with Aspire',
    speakers: [
      { name: 'Pierce Boggan' },
      { name: 'Maddy Montaquila' },
    ],
    abstract: 'TBD',
    timeslot: '11:45 AM PT',
    duration: '30 min',
  },
  {
    title: 'Aspire Dashboard as the Ultimate DevEx',
    speakers: [
      { name: 'Michael Cortese' },
    ],
    abstract: 'TBD',
    timeslot: '12:15 PM PT',
    duration: '30 min',
  },
  {
    title: 'Aspire + TypeScript',
    speakers: [
      { name: 'Josh Goldberg' },
    ],
    abstract: 'TBD',
    timeslot: '12:45 PM PT',
    duration: '30 min',
  },
  {
    title: 'One AppHost, Many Languages',
    speakers: [
      { name: 'Chris Ayers', headshot: ayersPic, jobTitle: 'Principal Software Engineer', company: 'Azure @ Microsoft' },
    ],
    abstract: 'Aspire makes polyglot systems feel like one product by letting you run and wire everything through a single AppHost. Chris will show some popular patterns - like a Go backend + Vite frontend, Python API + JS frontend, Spring Boot with PostgreSQL, and C# API with CosmosDB. You\'ll see the same repeatable workflow for local dev, service discovery, and config across Python, TypeScript, Go, Java, and .NET, without the usual chaotic repo setup and onboarding.',
    timeslot: '1:15 PM PT',
    duration: '30 min',
  },
  {
    title: 'Deployment',
    speakers: [
      { name: 'Mitch Denny' },
    ],
    abstract: 'TBD',
    timeslot: '1:45 PM PT',
    duration: '30 min',
  },
  {
    title: 'From Microservices to Water Sensors: End-to-End Testing with Aspire',
    speakers: [
      { name: 'Andres Rodriguez' },
    ],
    abstract: 'TBD',
    timeslot: '2:15 PM PT',
    duration: '30 min',
  },
  {
    title: 'Contributing to Aspire',
    speakers: [
      { name: 'Jose Perez Rodriguez' },
    ],
    abstract: 'TBD',
    timeslot: '2:45 PM PT',
    duration: '30 min',
  },
  {
    title: 'OpenCode and Aspire for Perf Issues',
    speakers: [
      { name: 'Luke Parker' },
    ],
    abstract: 'TBD',
    timeslot: '3:15 PM PT',
    duration: '30 min',
  },
  {
    title: 'Entra ID',
    speakers: [
      { name: 'Jean-Marc Prieur' },
      { name: 'Jenny Ferries' },
    ],
    abstract: 'TBD',
    timeslot: '3:45 PM PT',
    duration: '30 min',
  },
  {
    title: 'Aspire on AWS',
    speakers: [
      { name: 'Norm Johanson' },
    ],
    abstract: 'TBD',
    timeslot: '4:15 PM PT',
    duration: '30 min',
  },
];
