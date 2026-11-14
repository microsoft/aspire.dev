---
title: Contributors 🤝
seoTitle: Aspire contributors and the open-source community team
description: Meet the contributors who help make Aspire better every day. Explore the global community of engineers, writers, and translators powering the Aspire ecosystem.
editUrl: false
giscus: false
pageActions: false
props:
  contributor_list_ignore:
    - Copilot
    - github-actions[bot]
    - dependabot[bot]
    - dependabot
    - dotnet-maestro[bot]
    - copilot-swe-agent
    - microsoftopensource
---

Aspire wouldn't be what it is today without the amazing contributions from our community. From code contributions to documentation improvements, every bit helps us grow and improve. Your ideas have the potential to shape the future of the project, and issues you uncover help others be successful too. Interested in contributing?

{% linkbutton "/community/contributor-guide/", icon: "rocket", icon_placement: "start", variant: "primary" %}
Contribute to aspire.dev!
{% endlinkbutton %}

## 🙏 Aspire contributors

Thank you to all the community members who have contributed to Aspire! Your efforts help shape the future of this project. Collaborating on Aspire means joining a vibrant community that's building the next evolution of cloud-native applications. Aspire is the successor to Microsoft's experimental "Project Tye"—originally called "Astra"—and its ambitions are far reaching and extensible. By contributing, you're helping to define new patterns, unlock extensibility, and drive innovation for developers everywhere. Jump in and help us push the boundaries of what's possible!

{% contributor_list github_repo: "microsoft/aspire", ignore: props.contributor_list_ignore %}

{% github_repo_stats stats: github-stats, repo_name: "microsoft/aspire" %}

## 💜 Aspire samples contributors

Thank you to all the community members who have contributed to Aspire Samples! Your contributions help showcase the power and flexibility of Aspire in real-world scenarios. By sharing your solutions and examples, you empower others to learn, experiment, and build with confidence. Every sample you contribute can inspire new ideas and help fellow developers overcome challenges. Join us in collaborating and contributing—your real-world scenarios make a difference and help the entire community grow!

{% contributor_list github_repo: "microsoft/aspire-samples", ignore: props.contributor_list_ignore %}

{% github_repo_stats stats: github-stats, repo_name: "microsoft/aspire-samples" %}

## 🧰 Aspire Community Toolkit contributors

For the community, by the community. The Aspire Community Toolkit grows through passionate contributors building extensions and enhancements for the ecosystem. Your contributions shape Aspire's future and empower developers worldwide. Join the journey and help craft a toolkit reflecting diverse needs and our shared innovative spirit.

{% contributor_list github_repo: "CommunityToolkit/Aspire", ignore: props.contributor_list_ignore %}

{% github_repo_stats stats: github-stats, repo_name: "CommunityToolkit/Aspire" %}

## 🌐 aspire.dev contributors

Want to help [improve the aspire.dev site?](/community/contributor-guide/) We're always looking for contributors to help enhance our docs, fix typos, and add new content. Your contributions make it easier for everyone to learn and use Aspire effectively. Join us in making aspire.dev the best resource it can be!

{% contributor_list github_repo: "microsoft/aspire.dev", ignore: props.contributor_list_ignore %}

{% github_repo_stats stats: github-stats, repo_name: "microsoft/aspire.dev" %}

## ⚙️ DCP contributors

The [Developer Control Plane (DCP)](/architecture/overview/#developer-control-plane) is the open-source local application runner that powers Aspire. It orchestrates the processes and containers in your app model, manages their networking and lifecycle, and exposes a Kubernetes-compatible API for tools and IDEs to run and debug your services.

{% contributor_list github_repo: "microsoft/dcp", ignore: props.contributor_list_ignore %}

{% github_repo_stats stats: github-stats, repo_name: "microsoft/dcp" %}

## 🤓 Aspire team

Made with 💜 at Microsoft...

{% aspire_map %}
