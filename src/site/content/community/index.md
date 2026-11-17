---
title: Aspire community channels and links
prev:
  link: /reference/overview/
  label: Reference
next: false
description: Connect with the Aspire team and community across Discord, GitHub Discussions, livestreams, social channels, and contribution platforms for distributed apps.
banner:
  content: |
    <strong>✨ Aspire 13.6 is available!</strong> — <a href="/whats-new/aspire-13-6/">Explore the latest features and improvements</a>
bannerAutoDismissAfterDays: 14
editUrl: false
giscus: false
tableOfContents: false
pageActions: false
props:
  topic_hero_floating_icons:
    - github
    - comment-alt
    - pencil
    - discord
    - add-document
  topic_hero_primary_cta:
    label: Start contributing
    href: /community/contributor-guide/
  topic_hero_secondary_cta:
    label: Watch live streams
    href: /community/videos/
  capability_grid_capabilities:
    - icon: discord
      title: Join us on Discord
      description: Chat with the team and community members, ask questions, and share feedback in real time.
      href: https://discord.com/invite/raNPcaaSj8
    - icon: document
      title: Read our blog
      description: Get release updates, announcements, and deep dives from the Aspire engineering team.
      href: https://devblogs.microsoft.com/aspire
    - icon: blueSky
      title: Follow us on BlueSky
      description: See community highlights, quick tips, and follow the latest Aspire news and releases.
      href: https://bsky.app/profile/aspire.dev
    - icon: x.com
      title: Follow us on X
      description: Keep up with announcements, clips, and quick updates from the team and community.
      href: https://x.com/aspiredotdev
    - icon: youtube
      title: Watch us on YouTube
      description: Catch Aspire sessions, deep-dive demos, conference talks, and livestream replays.
      href: https://youtube.com/@aspiredotdev
    - icon: twitch
      title: Watch us on Twitch
      description: Join live community streams, pair-programming sessions, and interact with us in real time.
      href: https://twitch.tv/aspiredotdev
  feature_showcase_features:
    - icon: github
      title: Contribute to Aspire
      description: Help improve the core Aspire project with code, issues, and ideas. The runtime, integrations, and tooling are all open source.
      href: https://github.com/microsoft/aspire
      label: View on GitHub
      accent: purple
    - icon: pencil
      title: Contribute to aspire.dev
      description: Improve docs, guides, and examples on this very site. Start with the contributor guide to set up your environment.
      href: /community/contributor-guide/
      label: Contributor guide
      accent: blue
    - icon: translate
      title: Help translate
      description: Aspire docs are available in 16+ languages. Help make Aspire accessible to developers around the world.
      href: /community/translation-guide/
      label: Translation guide
      accent: green
    - icon: star
      title: Meet the contributors
      description: See who is building Aspire. Browse the contributor list and discover the people behind the project.
      href: /community/contributors/
      label: View contributors
      accent: orange
  cta_banner_primary_cta:
    label: Read the contributor guide
    href: /community/contributor-guide/
  cta_banner_secondary_cta:
    label: Join Discord
    href: https://discord.com/invite/raNPcaaSj8
---

{% topic_hero icon: "heart", title: "Built together,", highlight: "in the open.", subtitle: "Join thousands of developers building, contributing, and learning together across social channels, live streams, and open-source repos.", accent: "magenta", floating_icons: props.topic_hero_floating_icons, primary_cta: props.topic_hero_primary_cta, secondary_cta: props.topic_hero_secondary_cta %}

## Connect with us

{% capability_grid columns: 2, capabilities: props.capability_grid_capabilities %}

## Watch and learn

Catch up on the latest videos from the Aspire team and community. From deep-dive demos to conference talks, there’s a wealth of content to explore.

{% tabs sync: "stream-source" %}
{% tab "YouTube", value: "youtube", icon: "youtube" %}
{% youtube_embed video_id: "6j61K9Sna2M", title: nil %}
{% endtab %}
{% tab "Twitch", value: "twitch", icon: "twitch" %}
{% twitch_embed "aspiredotdev", title: nil %}
{% endtab %}
{% endtabs %}

## Get involved

Whether you're fixing a typo, building an integration, or translating docs — every contribution makes Aspire better for everyone.

{% feature_showcase features: props.feature_showcase_features %}

{% cta_banner title: "Ready to be part of it?", description: "Aspire is open source and community driven. Whether you code, write docs, or spread the word — there's a place for you.", primary_cta: props.cta_banner_primary_cta, secondary_cta: props.cta_banner_secondary_cta %}
