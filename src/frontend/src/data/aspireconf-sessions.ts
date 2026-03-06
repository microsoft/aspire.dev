import type { Props as SessionProps } from '@components/SessionCard.astro';

// Import speaker headshots, e.g.:
import damianPic from '@assets/aspireconf/damian.png';
import fowlerPic from '@assets/aspireconf/fowler.png';
import maddyPic from '@assets/aspireconf/maddy.jpg';
import pinePic from '@assets/aspireconf/pine.webp';
import claudiaPic from '@assets/aspireconf/claudia.png';
import juarezPic from '@assets/aspireconf/seth.png';
import stocchiPic from '@assets/aspireconf/tommaso.png';
import michaelPic from '@assets/aspireconf/michaelcummings.png';
import piercePic from '@assets/aspireconf/pierce.png';
import andresPic from '@assets/aspireconf/andres.png';
import joshPic from '@assets/aspireconf/joshg.jpg';
import mitchPic from '@assets/aspireconf/mitch.png';
import ayersPic from '@assets/aspireconf/chrisayers.jpg';

export const sessions: SessionProps[] = [
  {
    title: 'Keynote: Come Meet the New Aspire',
    speakers: [
      { name: 'Maddy Montaquila', headshot: maddyPic, jobTitle: 'Principal Product Manager', company: 'Aspire @ Microsoft' },
      { name: 'Damian Edwards', headshot: damianPic, jobTitle: 'Principal Architect', company: 'Aspire @ Microsoft' },
      { name: 'David Fowler', headshot: fowlerPic, jobTitle: 'Distinguished Engineer', company: 'Aspire @ Microsoft' },
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
      { name: 'Claudia Regio', headshot: claudiaPic, jobTitle: 'Senior Product Manager', company: 'Dev Tools @ Microsoft' },
    ],
    abstract: 'What happens when you learn Aspire alongside someone seeing it for the first time? David walks Claudia through a live, beginner-friendly tour — from localhost to the cloud. Expect real questions, clear explanations, and a fresh look at how Aspire handles orchestration, observability, and service composition today. Whether you’re new or catching up, you’ll leave with a simple mental model and a clear way to explain Aspire to your team.',
    timeslot: '10:00 AM PT',
    duration: '45 min',
  },
  {
    title: 'Aspire to Be Agentic: Designing Distributed Agentic Systems Without the Chaos',
    speakers: [
      { name: 'Tommaso Stocchi', headshot: stocchiPic, jobTitle: 'Cloud Solution Architect', company: 'Microsoft'},
      { name: 'Seth Juarez', headshot: juarezPic, jobTitle: 'Principal Product Manager', company: 'DevRel @ Microsoft'},
    ],
    abstract: 'Agentic systems are inherently distributed: multiple agents, multiple services, multiple languages. And right from the start, things get messy fast. Silent failures. Unclear execution paths. Too many “What tool did the agent call?” moments. Aspire’s polyglot support and built-in observability help you bring order to the chaos. You’ll see how much easier your life becomes when building agentic applications with Aspire.',
    timeslot: '11:00 AM PT',
    duration: '30 min',
  },
  {
    title: 'Beyond Telemetry: Supercharging DevEx with the Aspire Dashboard',
    speakers: [
      { name: 'Michael Cummings', headshot: michaelPic,  jobTitle: 'Principal Software Engineer', company: "NuGet + VS Marketplace @ Microsoft" },
    ],
    abstract: 'Aspire is often positioned as a way to model and run distributed applications, but its biggest impact is how it improves the everyday developer experience. In this talk, we\'ll focus on small, practical features in Aspire that reduce friction during local development and testing. Rather than adding complexity, these capabilities help you move faster with fewer context switches. Get some concrete ideas for using Aspire to make your app dev more approachable, safer to operate, and easier to work on day to day. Aspire doesn’t just help you run distributed apps—it helps you think less while building them.',
    timeslot: '11:30 AM PT',
    duration: '30 min',
  },
  {
    title: 'Coding Agents Need Aspire Too',
    speakers: [
      { name: 'Pierce Boggan', headshot: piercePic, jobTitle: 'PM Lead', company: 'VS Code + GitHub Copilot @ Microsoft' },
    ],
    abstract: 'Your coding agents are only as good as the context they can access. Aspire hands them the keys — your entire app topology, real-time logs and traces, and resource commands like stop and restart — all with zero setup. You\'ll see how Aspire turns your agents from helpful assistants into full-stack collaborators you can actually trust.',
    timeslot: '12:00 PM PT',
    duration: '30 min',
  },
  {
    title: 'From Microservices to Water Sensors: End-to-End Testing with Aspire',
    speakers: [
      { name: 'Andres Rodriguez', headshot: andresPic },
    ],
    abstract: 'In this session, Andres will walk through how he uses Aspire to test an end-to-end pipeline that spans from cloud microservices to physical IoT devices — specifically an automated irrigation system powered by Arduino sensors and water pumps. You\'ll learn how Aspire\'s orchestration and integration testing capabilities can verify not just your web APIs and databases, but the full journey of data from a soil moisture sensor through HTTP endpoints to a real-time dashboard. Whether you\'re building traditional web apps or pushing Aspire into unconventional territory, you\'ll walk away with practical patterns for reliable end-to-end testing.',
    timeslot: '12:30 PM PT',
    duration: '30 min',
  },
  {
    title: 'One AppHost, Many Languages',
    speakers: [
      { name: 'Chris Ayers', headshot: ayersPic, jobTitle: 'Principal Software Engineer', company: 'Azure @ Microsoft' },
    ],
    abstract: 'Aspire makes polyglot systems feel like one product by letting you run and wire everything through a single AppHost. Chris will show some popular patterns - like a Go backend + Vite frontend, Python API + JS frontend, Spring Boot with PostgreSQL, and C# API with CosmosDB. You\'ll see the same repeatable workflow for local dev, service discovery, and config across Python, TypeScript, Go, Java, and .NET, without the usual chaotic repo setup and onboarding.',
    timeslot: '1:00 PM PT',
    duration: '30 min',
  },
  {
    title: 'TypeScript and Aspire: Type Safety for Your Dev Experience',
    speakers: [
      { name: 'Josh Goldberg', headshot: joshPic, jobTitle: 'Senior Frontend Developer', company: 'Sentry' },
    ],
    abstract: 'Types aren\'t just for your server-side C#: they\'re a huge benefit in frontend and full-stack logic too! Let\'s dive into all the wonderfully fully-typed libraries and utilities in a freshly installed Aspire app. We\'ll cover the basics of how types work in TypeScript compared to traditional languages like C#, how they simultaneously catch bugs and help you write features in your code, and uncover some seriously nifty features of the TypeScript type system along the way.',
    timeslot: '1:30 PM PT',
    duration: '30 min',
  },
    {
    title: 'Auth Made Easy(ish) with Aspire and Entra ID',
    speakers: [
      { name: 'Jenny Ferries' },
      { name: 'Jean-Marc Prieur'}
    ],
    abstract: 'TBD',
    timeslot: '2:00 PM PT',
    duration: '30 min',
  },
  {
    title: 'Aspire Escapes the Inner Loop and Does Deployment',
    speakers: [
      { name: 'Mitch Denny', headshot: mitchPic, jobTitle: 'Principal Software Engineer', company: 'Aspire @ Microsoft' },
    ],
    abstract: 'Everyone knows that Aspire makes your development inner loop awesome, but did you know that it can also be used to streamline your deployments - all the way to production! Recent releases of Aspire have significantly improved Aspire\'s end-to-end deployment capabilities and now is a great time to get across how they work and how it can be adapted to suit your specific environment.',
    timeslot: '2:30 PM PT',
    duration: '30 min',
  },
    {
    title: 'Aspire on AWS',
    speakers: [
      { name: 'Norm Johanson' },
    ],
    abstract: 'TBD',
    timeslot: '3:00 PM PT',
    duration: '30 min',
  },
  {
    title: 'Aspire at OpenCode',
    speakers: [
      { name: 'Luke Parker' },
    ],
    abstract: 'TBD',
    timeslot: '3:30 PM PT',
    duration: '30 min',
  },
  {
    title: 'Contributing to Aspire',
    speakers: [
      { name: 'Jose Perez Rodriguez', jobTitle: 'Principal Engineering Lead', company: 'Aspire @ Microsoft' },
      { name: 'Adam Ratzman', jobTitle: 'Senior Software Engineer', company: 'Aspire @ Microsoft' },
    ],
    abstract: 'Aspire is open-source, and our community is the best in the game. Getting involved is easier than you think — whether that\'s filing an issue, contributing code to the core repo, helping build out aspire.dev, or shipping integrations in the Community Toolkit. In this session, Jose (Aspire\'s engineering manager) and Adam (one of the devs on the team) will break down all the ways you can contribute and pull back the curtain on how our code gets reviewed, tested, and released.',
    timeslot: '4:00 PM PT',
    duration: '30 min',
  },
  {
    title: 'Customer Spotlight: Aspire for Windows 365 - Reliability, Extensibility, and Multi-Repo Rollout with AI',
    speakers: [
      { name: 'Chuanbo Zhang' },
      { name: 'Yongyu Chen' },
      { name: 'Jisheng Xing' }
    ],
    abstract: 'We\'ll share how Windows 365 doubled Aspire adoption while improving reliability by driving E2E CloudTest success and systematically removing the top onboarding blockers, including key reliability fixes for Azure Functions and Cosmos DB. We\'ll cover the concrete work that made runs consistently “green,” plus the repeatable onboarding patterns used to move services onto Aspire and CloudTest at scale. Finally, we\'ll demo and explain how Aspire acts as the agent orchestrator, with Aspire extensibility and the GitHub Copilot SDK enable AI-driven multi-repo rollout via an agent team—using analysis, remediation, and evolution agents to generate ready-to-merge pull requests that standardize repositories to a quality-gated, green baseline, without manual repo-by-repo effort.',
    timeslot: '4:30 PM PT',
    duration: '30 min',
  },
  {
    title: 'Closing',
    speakers: [
      { name: 'Maddy Montaquila', headshot: maddyPic, jobTitle: 'Principal Product Manager', company: 'Aspire @ Microsoft' },
      { name: 'Damian Edwards', headshot: damianPic, jobTitle: 'Principal Architect', company: 'Aspire @ Microsoft' },
      { name: 'David Fowler', headshot: fowlerPic, jobTitle: 'Distinguished Engineer', company: 'Aspire @ Microsoft' },
    ],
    abstract: 'Wrap-up the first ever Aspire Conf!',
    timeslot: '5:00 PM PT',
    duration: '15 min',
  },
];
