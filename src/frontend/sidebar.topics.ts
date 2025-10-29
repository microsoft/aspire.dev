import type { StarlightSidebarTopicsUserConfig } from "starlight-sidebar-topics";

export const sidebarTopics: StarlightSidebarTopicsUserConfig = [
  {
    label: {
      da: 'Dokumenter',
      de: 'Dokumente',
      en: 'Docs',
      es: 'Documentos',
      fr: 'Documents',
      hi: 'दस्तावेज़',
      id: 'Dokumen',
      it: 'Documenti',
      ja: 'ドキュメント',
      ko: '문서',
      'pt-BR': 'Documentos',
      'pt-PT': 'Documentos',
      ru: 'Документы',
      tr: 'Belgeler',
      uk: 'Документи',
      'zh-CN': '文档',
    },
    link: 'get-started/welcome',
    icon: 'open-book',
    items: [
      {
        label: 'Welcome', translations: {
          da: 'Velkommen',
          de: 'Willkommen',
          en: 'Welcome',
          es: 'Bienvenida',
          fr: 'Bienvenue',
          hi: 'स्वागत',
          id: 'Selamat datang',
          it: 'Benvenuto',
          ja: 'ようこそ',
          ko: '환영합니다',
          'pt-BR': 'Bem-vindo',
          'pt-PT': 'Bem-vindo',
          ru: 'Добро пожаловать',
          tr: 'Hoş geldiniz',
          uk: 'Ласкаво просимо',
          'zh-CN': '欢迎',
        }, slug: 'get-started/welcome'
      },
      {
        label: "What's new", collapsed: true, items: [
          { label: 'Aspire 9.5', slug: 'whats-new/aspire-9-5' }
        ],
        translations: {
          da: 'Hvad er nyt',
          de: 'Was gibt es Neues',
          en: "What's new",
          es: 'Novedades',
          fr: 'Quoi de neuf',
          hi: 'क्या नया है',
          id: 'Apa yang baru',
          it: 'Novità',
          ja: '新着情報',
          ko: '새로운 소식',
          'pt-BR': 'Novidades',
          'pt-PT': 'Novidades',
          ru: 'Что нового',
          tr: 'Yeni neler var',
          uk: 'Що нового',
          'zh-CN': '新内容',
        }
      },
      {
        label: 'Get Started', translations: {
          da: 'Kom godt i gang',
          de: 'Erste Schritte',
          en: 'Get Started',
          es: 'Empezar',
          fr: 'Commencer',
          hi: 'शुरू करें',
          id: 'Mulai',
          it: 'Iniziare',
          ja: '始める',
          ko: '시작하기',
          'pt-BR': 'Começar',
          'pt-PT': 'Começar',
          ru: 'Начать',
          tr: 'Başlamak',
          uk: 'Розпочати',
          'zh-CN': '开始',
        },
        items: [
          {
            label: 'Prerequisites',
            translations: {
              da: 'Forudsætninger',
              de: 'Voraussetzungen',
              en: 'Prerequisites',
              es: 'Requisitos previos',
              fr: 'Prérequis',
              hi: 'पूर्वापेक्षाएँ',
              id: 'Prasyarat',
              it: 'Prerequisiti',
              ja: '前提条件',
              ko: '전제 조건',
              'pt-BR': 'Pré-requisitos',
              'pt-PT': 'Pré-requisitos',
              ru: 'Предварительные требования',
              tr: 'Ön koşullar',
              uk: 'Попередні вимоги',
              'zh-CN': '先决条件',
            },
            slug: 'get-started/prerequisites'
          },
          {
            label: 'Installation',
            translations: {
              da: 'Installation',
              de: 'Installation',
              en: 'Installation',
              es: 'Instalación',
              fr: 'Installation',
              hi: 'स्थापना',
              id: 'Instalasi',
              it: 'Installazione',
              ja: 'インストール',
              ko: '설치',
              'pt-BR': 'Instalação',
              'pt-PT': 'Instalação',
              ru: 'Установка',
              tr: 'Kurulum',
              uk: 'Встановлення',
              'zh-CN': '安装',
            }, slug: 'get-started/installation'
          },
          {
            label: 'First app',
            translations: {
              da: 'Første app',
              de: 'Erste App',
              en: 'First app',
              es: 'Primera app',
              fr: 'Première app',
              hi: 'पहला ऐप',
              id: 'Aplikasi Pertama',
              it: 'Prima app',
              ja: '最初のアプリ',
              ko: '첫 번째 앱',
              'pt-BR': 'Primeiro app',
              'pt-PT': 'Primeiro app',
              ru: 'Первое приложение',
              tr: 'İlk uygulama',
              uk: 'Перше застосування',
              'zh-CN': '第一个应用',
            },
            slug: 'get-started/first-app',
            badge: {
              text: {
                da: 'Hurtigstart',
                de: 'Schnellstart',
                en: 'Quickstart',
                es: 'Inicio rápido',
                fr: 'Démarrage rapide',
                hi: 'त्वरित प्रारंभ',
                id: 'Panduan Cepat',
                it: 'Avvio rapido',
                ja: 'クイックスタート',
                ko: '빠른 시작',
                'pt-BR': 'Introdução Rápida',
                'pt-PT': 'Introdução Rápida',
                ru: 'Быстрый старт',
                tr: 'Hızlı Başlangıç',
                uk: 'Швидкий старт',
                'zh-CN': '快速入门',
              }
            }
          }
        ]
      },
      {
        label: 'Concepts',
        translations: {
          da: 'Begreber',
          de: 'Konzepte',
          en: 'Concepts',
          es: 'Conceptos',
          fr: 'Concepts',
          hi: 'अवधारणाएँ',
          id: 'Konsep',
          it: 'Concetti',
          ja: '概念',
          ko: '개념',
          'pt-BR': 'Conceitos',
          'pt-PT': 'Conceitos',
          ru: 'Концепции',
          tr: 'Kavramlar',
          uk: 'Концепції',
          'zh-CN': '概念',
        },
        items: [
          {
            label: 'What is Aspire?', translations: {
              da: 'Hvad er Aspire?',
              de: 'Was ist Aspire?',
              en: 'What is Aspire?',
              es: '¿Qué es Aspire?',
              fr: 'Qu\'est-ce qu’Aspire ?',
              hi: 'Aspire क्या है?',
              id: 'Apa itu Aspire?',
              it: 'Che cos\'è Aspire?',
              ja: 'Aspire とは?',
              ko: 'Aspire란 무엇인가요?',
              'pt-BR': 'O que é Aspire?',
              'pt-PT': 'O que é Aspire?',
              ru: 'Что такое Aspire?',
              tr: 'Aspire nedir?',
              uk: 'Що таке Aspire?',
              'zh-CN': '什么是 Aspire？',
            }, slug: 'get-started/what-is-aspire'
          },
          {
            label: 'What is the AppHost?', translations: {
              da: 'Hvad er AppHost?',
              de: 'Was ist der AppHost?',
              en: 'What is the AppHost?',
              es: '¿Qué es el AppHost?',
              fr: 'Qu\'est-ce que l’AppHost ?',
              hi: 'AppHost क्या है?',
              id: 'Apa itu AppHost?',
              it: 'Che cos\'è l’AppHost?',
              ja: 'AppHost とは?',
              ko: 'AppHost란 무엇인가요?',
              'pt-BR': 'O que é o AppHost?',
              'pt-PT': 'O que é o AppHost?',
              ru: 'Что такое AppHost?',
              tr: 'AppHost nedir?',
              uk: 'Що таке AppHost?',
              'zh-CN': '什么是 AppHost？',
            }, slug: 'get-started/app-host'
          },
          {
            label: 'Understanding Resources', translations: {
              da: 'Forstå ressourcer',
              de: 'Ressourcen verstehen',
              en: 'Understanding Resources',
              es: 'Comprender los recursos',
              fr: 'Comprendre les ressources',
              hi: 'संसाधनों को समझना',
              id: 'Memahami Sumber Daya',
              it: 'Comprendere le risorse',
              ja: 'リソースの理解',
              ko: '리소스 이해',
              'pt-BR': 'Compreendendo os recursos',
              'pt-PT': 'Compreender os recursos',
              ru: 'Понимание ресурсов',
              tr: 'Kaynakları anlama',
              uk: 'Розуміння ресурсів',
              'zh-CN': '了解资源',
            }, slug: 'get-started/resources'
          },
          {
            label: 'Deployment and App Topology', translations: {
              da: 'Udrulning og apptopologi',
              de: 'Bereitstellung und App-Topologie',
              en: 'Deployment and App Topology',
              es: 'Despliegue y topología de la aplicación',
              fr: 'Déploiement et topologie de l’application',
              hi: 'परिनियोजन और ऐप टोपोलॉजी',
              id: 'Penyebaran dan Topologi Aplikasi',
              it: 'Distribuzione e topologia dell’applicazione',
              ja: 'デプロイとアプリのトポロジ',
              ko: '배포 및 앱 토폴로지',
              'pt-BR': 'Implantação e topologia do aplicativo',
              'pt-PT': 'Implementação e topologia da aplicação',
              ru: 'Развертывание и топология приложения',
              tr: 'Dağıtım ve uygulama topolojisi',
              uk: 'Розгортання і топологія застосунку',
              'zh-CN': '部署与应用拓扑',
            }, slug: 'get-started/deployment'
          }
        ]
      },
      {
        label: 'Architecture', translations: {
          da: 'Arkitektur',
          de: 'Architektur',
          en: 'Architecture',
          es: 'Arquitectura',
          fr: 'Architecture',
          hi: 'आर्किटेक्चर',
          id: 'Arsitektur',
          it: 'Architettura',
          ja: 'アーキテクチャ',
          ko: '아키텍처',
          'pt-BR': 'Arquitetura',
          'pt-PT': 'Arquitetura',
          ru: 'Архитектура',
          tr: 'Mimari',
          uk: 'Архітектура',
          'zh-CN': '架构',
        },
        collapsed: true,
        items: [
          {
            label: 'Overview',
            translations: {
              da: 'Oversigt',
              de: 'Übersicht',
              en: 'Overview',
              es: 'Descripción general',
              fr: 'Vue d\'ensemble',
              hi: 'अवलोकन',
              id: 'Ikhtisar',
              it: 'Panoramica',
              ja: '概要',
              ko: '개요',
              pt: 'Visão geral',
              'pt-BR': 'Visão geral',
              'pt-PT': 'Visão geral',
              ru: 'Обзор',
              tr: 'Genel Bakış',
              uk: 'Огляд',
              'zh-CN': '概述',
            },
            slug: 'architecture/overview'
          },
          {
            label: 'Resource Model', translations: {
              da: 'Ressourcemodel',
              de: 'Ressourcenmodell',
              en: 'Resource Model',
              es: 'Modelo de recurso',
              fr: 'Modèle de ressource',
              hi: 'संसाधन मॉडल',
              id: 'Model Sumber Daya',
              it: 'Modello di risorsa',
              ja: 'リソースモデル',
              ko: '리소스 모델',
              'pt-BR': 'Modelo de Recurso',
              'pt-PT': 'Modelo de Recurso',
              ru: 'Модель ресурса',
              tr: 'Kaynak Modeli',
              uk: 'Модель ресурсу',
              'zh-CN': '资源模型',
            }, slug: 'architecture/resource-model'
          },
          {
            label: 'Resource Hierarchies',
            translations: {
              da: 'Ressourcehierarkier',
              de: 'Ressourcenhierarchien',
              en: 'Resource Hierarchies',
              es: 'Jerarquías de recursos',
              fr: 'Hiérarchies de ressources',
              hi: 'संसाधन पदानुक्रम',
              id: 'Hierarki Sumber Daya',
              it: 'Gerarchie delle risorse',
              ja: 'リソース階層',
              ko: '리소스 계층',
              'pt-BR': 'Hierarquias de Recursos',
              'pt-PT': 'Hierarquias de Recursos',
              ru: 'Иерархии ресурсов',
              tr: 'Kaynak Hiyerarşileri',
              uk: 'Ієрархії ресурсів',
              'zh-CN': '资源层次结构',
            }, slug: 'architecture/resource-hierarchies'
          },
          {
            label: 'Resource API Patterns',
            translations: {
              da: 'Ressource-API-mønstre',
              de: 'Ressource-API-Muster',
              en: 'Resource API Patterns',
              es: 'Patrones de API de recursos',
              fr: 'Modèles d\'API de ressources',
              hi: 'संसाधन एपीआई पैटर्न',
              id: 'Pola API Sumber Daya',
              it: 'Modelli di API di risorse',
              ja: 'リソースAPIパターン',
              ko: '리소스 API 패턴',
              'pt-BR': 'Padrões de API de Recursos',
              'pt-PT': 'Padrões de API de Recursos',
              ru: 'Шаблоны API ресурсов',
              tr: 'Kaynak API Desenleri',
              uk: 'Шаблони API ресурсів',
              'zh-CN': '资源API模式',
            }, slug: 'architecture/resource-api-patterns'
          },
          {
            label: 'Resource Publishing',
            translations: {
              da: 'Ressourcepublicering',
              de: 'Ressourcenveröffentlichung',
              en: 'Resource Publishing',
              es: 'Publicación de recursos',
              fr: 'Publication de ressources',
              hi: 'संसाधन प्रकाशन',
              id: 'Penerbitan Sumber Daya',
              it: 'Pubblicazione delle risorse',
              ja: 'リソースの公開',
              ko: '리소스 게시',
              'pt-BR': 'Publicação de Recursos',
              'pt-PT': 'Publicação de Recursos',
              ru: 'Публикация ресурсов',
              tr: 'Kaynak Yayınlama',
              uk: 'Публікація ресурсів',
              'zh-CN': '资源发布',
            },
            slug: 'architecture/resource-publishing'
          },
          {
            label: 'Resource Examples', translations: {
              da: 'Ressourceeksempler',
              de: 'Ressourcenbeispiele',
              en: 'Resource Examples',
              es: 'Ejemplos de recursos',
              fr: 'Exemples de ressources',
              hi: 'संसाधन उदाहरण',
              id: 'Contoh Sumber Daya',
              it: 'Esempi di risorse',
              ja: 'リソースの例',
              ko: '리소스 예제',
              'pt-BR': 'Exemplos de Recursos',
              'pt-PT': 'Exemplos de Recursos',
              ru: 'Примеры ресурсов',
              tr: 'Kaynak Örnekleri',
              uk: 'Приклади ресурсів',
              'zh-CN': '资源示例',
            }, slug: 'architecture/resource-examples'
          },
          {
            label: 'Glossary', translations: {
              da: 'Ordbog',
              de: 'Glossar',
              en: 'Glossary',
              es: 'Glosario',
              fr: 'Glossaire',
              hi: 'शब्दावली',
              id: 'Kamus',
              it: 'Glossario',
              ja: '用語集',
              ko: '용어집',
              'pt-BR': 'Glossário',
              'pt-PT': 'Glossário',
              ru: 'Глоссарий',
              tr: 'Sözlük',
              uk: 'Глосарій',
              'zh-CN': '术语表',
            },
            slug: 'architecture/glossary'
          },
        ]
      }
    ]
  },
  {
    label: {
      en: 'Integrations',
      es: 'Integraciones',
      fr: 'Intégrations',
      de: 'Integrationen',
      it: 'Integrazioni',
      pt: 'Integrações',
      ru: 'Интеграции',
      'zh-CN': '集成',
      da: 'Integrationer',
      hi: 'इंटीग्रेशन',
      id: 'Integrasi',
      ja: 'インテグレーション',
      ko: '통합',
      'pt-BR': 'Integrações',
      'pt-PT': 'Integrações',
      tr: 'Entegrasyonlar',
      uk: 'Інтеграції',
    },
    link: '/integrations/gallery',
    icon: 'puzzle',
    items: [
      {
        label: 'Explore', translations: {
          da: 'Udforsk',
          de: 'Entdecken',
          en: 'Explore',
          es: 'Explorar',
          fr: 'Explorer',
          hi: 'अन्वेषण',
          id: 'Jelajahi',
          it: 'Esplora',
          ja: '参照',
          ko: '탐색',
          pt: 'Explorar',
          'pt-BR': 'Explorar',
          'pt-PT': 'Explorar',
          ru: 'Исследовать',
          tr: 'Keşfet',
          uk: 'Дослідити',
          'zh-CN': '探索',
        }, items: [
          {
            label: 'Gallery', translations: {
              da: 'Galleri',
              de: 'Galerie',
              en: 'Gallery',
              es: 'Galería',
              fr: 'Galerie',
              hi: 'गैलरी',
              id: 'Galeri',
              it: 'Galleria',
              ja: 'ギャラリー',
              ko: '갤러리',
              pt: 'Galeria',
              'pt-BR': 'Galeria',
              'pt-PT': 'Galeria',
              ru: 'Галерея',
              tr: 'Galeri',
              uk: 'Галерея',
              'zh-CN': '画廊',
            }, slug: 'integrations/gallery'
          },
          {
            label: 'Overview', translations: {
              da: 'Oversigt',
              de: 'Übersicht',
              en: 'Overview',
              es: 'Descripción general',
              fr: 'Vue d\'ensemble',
              hi: 'अवलोकन',
              id: 'Ikhtisar',
              it: 'Panoramica',
              ja: '概要',
              ko: '개요',
              pt: 'Visão geral',
              'pt-BR': 'Visão geral',
              'pt-PT': 'Visão geral',
              ru: 'Обзор',
              tr: 'Genel Bakış',
              uk: 'Огляд',
              'zh-CN': '概述',
            }, slug: 'integrations/overview'
          },
        ]
      },
      {
        label: 'Database',
        translations: {
          da: 'Database',
          de: 'Datenbank',
          en: 'Database',
          es: 'Base de datos',
          fr: 'Base de données',
          hi: 'डेटाबेस',
          id: 'Basis Data',
          it: 'Database',
          ja: 'データベース',
          ko: '데이터베이스',
          pt: 'Banco de dados',
          'pt-BR': 'Banco de dados',
          'pt-PT': 'Base de dados',
          ru: 'База данных',
          tr: 'Veritabanı',
          uk: 'База даних',
          'zh-CN': '数据库',
        }, items: [
          { label: 'PostgreSQL', slug: 'integrations/postgres' },
        ]
      },
      {
        label: 'Messaging',
        translations: {
          da: 'Meddelelser',
          de: 'Messaging',
          en: 'Messaging',
          es: 'Mensajería',
          fr: 'Messagerie',
          hi: 'मैसेजिंग',
          id: 'Pengiriman Pesan',
          it: 'Messaggistica',
          ja: 'メッセージング',
          ko: '메시징',
          pt: 'Mensageria',
          'pt-BR': 'Mensageria',
          'pt-PT': 'Mensageria',
          ru: 'Обмен сообщениями',
          tr: 'Mesajlaşma',
          uk: 'Обмін повідомленнями',
          'zh-CN': '消息传递',
        },
        items: [
          { label: 'RabbitMQ', slug: 'integrations/rabbitmq' },
        ]
      }
    ],
  },
  // {
  //   label: 'Dashboard',
  //   link: '/dashboard/overview',
  //   icon: 'seti:happenings',
  //   items: [
  //     { label: 'Explore', autogenerate: { directory: 'dashboard' } },
  //   ]
  // },
  {
    label: {
      en: 'CLI Reference',
      es: 'Referencia de CLI',
      fr: 'Référence CLI',
      de: 'CLI-Referenz',
      it: 'Riferimento CLI',
      pt: 'Referência de CLI',
      ru: 'Справочник CLI',
      'zh-CN': 'CLI 参考',
      da: 'CLI-reference',
      hi: 'CLI संदर्भ',
      id: 'Referensi CLI',
      ja: 'CLI リファレンス',
      ko: 'CLI 참고서',
      'pt-BR': 'Referência de CLI',
      'pt-PT': 'Referência de CLI',
      tr: 'CLI Referansı',
      uk: 'CLI Довідник',
    },
    link: '/reference/cli/overview',
    icon: 'forward-slash',
    items: [
      {
        label: 'Overview', translations: {
          da: 'Oversigt', de: 'Übersicht', en: 'Overview', es: 'Descripción general', fr: 'Vue d\'ensemble', hi: 'अवलोकन', id: 'Ikhtisar', it: 'Panoramica', ja: '概要', ko: '개요', pt: 'Visão geral', 'pt-BR': 'Visão geral', 'pt-PT': 'Visão geral', ru: 'Обзор', tr: 'Genel Bakış', uk: 'Огляд', 'zh-CN': '概述'
        }, slug: 'reference/cli/overview'
      },
      {
        label: 'Install', translations: {
          da: 'Installation', de: 'Installation', en: 'Install', es: 'Instalar', fr: 'Installer', hi: 'इंस्टॉल', id: 'Instalasi', it: 'Installazione', ja: 'インストール', ko: '설치', pt: 'Instalar', 'pt-BR': 'Instalar', 'pt-PT': 'Instalar', ru: 'Установка', tr: 'Kurulum', uk: 'Встановлення', 'zh-CN': '安装'
        }, slug: 'reference/cli/install'
      },
      {
        label: 'Install Script', translations: {
          da: 'Installationsscript', de: 'Installationsskript', en: 'Install Script', es: 'Script de instalación', fr: 'Script d\'installation', hi: 'इंस्टॉलेशन स्क्रिप्ट', id: 'Skrip Instalasi', it: 'Script di installazione', ja: 'インストールスクリプト', ko: '설치 스크립트', pt: 'Script de instalação', 'pt-BR': 'Script de instalação', 'pt-PT': 'Script de instalação', ru: 'Скрипт установки', tr: 'Kurulum Betiği', uk: 'Скрипт установки', 'zh-CN': '安装脚本'
        }, slug: 'reference/cli/install-script'
      },
      {
        label: 'Configuration', translations: {
          da: 'Konfiguration', de: 'Konfiguration', en: 'Configuration', es: 'Configuración', fr: 'Configuration', hi: 'कॉन्फ़िगरेशन', id: 'Konfigurasi', it: 'Configurazione', ja: '構成', ko: '구성', pt: 'Configuração', 'pt-BR': 'Configuração', 'pt-PT': 'Configuração', ru: 'Конфигурация', tr: 'Yapılandırma', uk: 'Конфігурація', 'zh-CN': '配置'
        }, slug: 'reference/cli/configuration'
      },
      {
        label: 'Commands', translations: {
          da: 'Kommandoer', de: 'Befehle', en: 'Commands', es: 'Comandos', fr: 'Commandes', hi: 'कमांड', id: 'Perintah', it: 'Comandi', ja: 'コマンド', ko: '명령어', pt: 'Comandos', 'pt-BR': 'Comandos', 'pt-PT': 'Comandos', ru: 'Команды', tr: 'Komutlar', uk: 'Команди', 'zh-CN': '命令'
        }, items: [
          { label: 'aspire', slug: 'reference/cli/commands/aspire' },
          { label: 'aspire add', slug: 'reference/cli/commands/aspire-add' },
          {
            label: 'aspire cache', collapsed: true, items: [
              { label: 'aspire cache', slug: 'reference/cli/commands/aspire-cache' },
              { label: 'aspire cache clear', slug: 'reference/cli/commands/aspire-cache-clear' },
            ]
          },
          {
            label: 'aspire config', collapsed: true, items: [
              { label: 'aspire config', slug: 'reference/cli/commands/aspire-config' },
              { label: 'aspire config list', slug: 'reference/cli/commands/aspire-config-list' },
              { label: 'aspire config get', slug: 'reference/cli/commands/aspire-config-get' },
              { label: 'aspire config set', slug: 'reference/cli/commands/aspire-config-set' },
              { label: 'aspire config delete', slug: 'reference/cli/commands/aspire-config-delete' },
            ]
          },
          { label: 'aspire deploy', slug: 'reference/cli/commands/aspire-deploy' },
          { label: 'aspire do', slug: 'reference/cli/commands/aspire-do' },
          { label: 'aspire exec', slug: 'reference/cli/commands/aspire-exec' },
          { label: 'aspire init', slug: 'reference/cli/commands/aspire-init' },
          { label: 'aspire new', slug: 'reference/cli/commands/aspire-new' },
          { label: 'aspire publish', slug: 'reference/cli/commands/aspire-publish' },
          { label: 'aspire run', slug: 'reference/cli/commands/aspire-run' },
          { label: 'aspire update', slug: 'reference/cli/commands/aspire-update' },
        ]
      }
    ]
  },
  // {
  //     label: 'API Reference',
  //     id: 'reference-api',
  //     link: '/api',
  //     icon: 'document',
  //     items: [
  //         { 
  //             label: 'API Reference', 
  //             collapsed: false, 
  //             autogenerate: { directory: '/reference/api', collapsed: true }
  //         },
  //     ]
  // },
  {
    label: {
      en: 'Samples',
      es: 'Ejemplos',
      fr: 'Exemples',
      de: 'Beispiele',
      it: 'Esempi',
      pt: 'Exemplos',
      ru: 'Примеры',
      'zh-CN': '示例',
      da: 'Eksempler',
      hi: 'उदाहरण',
      id: 'Contoh',
      ja: 'サンプル',
      ko: '샘플',
      'pt-BR': 'Exemplos',
      'pt-PT': 'Exemplos',
      tr: 'Örnekler',
      uk: 'Приклади',
    },
    link: 'https://github.com/dotnet/aspire-samples',
    icon: 'vscode',
  },
  {
    label: {
      en: 'Community',
      es: 'Comunidad',
      fr: 'Communauté',
      de: 'Gemeinschaft',
      it: 'Comunità',
      pt: 'Comunidade',
      ru: 'Сообщество',
      'zh-CN': '社区',
      da: 'Fællesskab',
      hi: 'समुदाय',
      id: 'Komunitas',
      ja: 'コミュニティ',
      ko: '커뮤니티',
      'pt-BR': 'Comunidade',
      'pt-PT': 'Comunidade',
      tr: 'Topluluk',
      uk: 'Спільнота',
    },
    link: '/community/contributors',
    icon: 'heart',
    items: [
      {
        label: 'Contributors', translations: {
          da: 'Bidragydere',
          de: 'Mitwirkende',
          en: 'Contributors',
          es: 'Colaboradores',
          fr: 'Contributeurs',
          hi: 'योगदानकर्ता',
          id: 'Kontributor',
          it: 'Collaboratori',
          ja: 'コントリビューター',
          ko: '기여자',
          pt: 'Contribuidores',
          'pt-BR': 'Contribuidores',
          'pt-PT': 'Contribuidores',
          ru: 'Участники',
          tr: 'Katkıda Bulunanlar',
          uk: 'Учасники',
          'zh-CN': '贡献者'
        }, slug: 'community/contributors'
      },
      {
        label: 'BlueSky',
        slug: 'community/posts',
        badge: {
          text: '#aspire',
          variant: 'note'
        }
      },
      {
        label: 'Videos', translations: {
          da: 'Videoer',
          de: 'Videos',
          en: 'Videos',
          es: 'Videos',
          fr: 'Vidéos',
          hi: 'वीडियो',
          id: 'Video',
          it: 'Video',
          ja: '動画',
          ko: '비디오',
          pt: 'Vídeos',
          'pt-BR': 'Vídeos',
          'pt-PT': 'Vídeos',
          ru: 'Видео',
          tr: 'Videolar',
          uk: 'Відео',
          'zh-CN': '视频'
        }, slug: 'community/videos'
      },
    ]
  }
];