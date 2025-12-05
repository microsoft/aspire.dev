import type { CookieConsentConfig } from "@jop-software/astro-cookieconsent";

export const cookieConfig: CookieConsentConfig = {
    guiOptions: {
        consentModal: {
            layout: 'box',
            position: 'bottom right',
            equalWeightButtons: false
        },
        preferencesModal: {
            layout: 'bar wide',
            position: 'right',
            equalWeightButtons: false
        },
    },
    categories: {
        necessary: {
            enabled: true,
            readOnly: true
        },
        analytics: {
            enabled: true,
            readOnly: false
        },
        advertising: {
            enabled: true,
            readOnly: false
        }
    },
    language: {
        default: 'en',
        autoDetect: 'document',
        translations: {
            en: {
                consentModal: {
                    title: 'This site uses cookies',
                    description: 'We use cookies to enhance your browsing experience, analyze site traffic, and improve our services. By clicking "Accept all," you consent to our use of cookies.',
                    acceptAllBtn: 'Accept all',
                    acceptNecessaryBtn: 'Reject all',
                    showPreferencesBtn: 'Manage preferences',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Privacy & Cookies</a>'
                },
                preferencesModal: {
                    title: 'Cookie preferences',
                    acceptAllBtn: 'Accept all',
                    acceptNecessaryBtn: 'Reject all',
                    savePreferencesBtn: 'Save preferences',
                    closeIconLabel: 'Close',
                    sections: [
                        {
                            title: 'Cookie usage',
                            description: 'We use cookies to provide essential website functionality and improve your experience.'
                        },
                        {
                            title: 'Strictly necessary',
                            description: 'Required for the website to function properly. These cannot be disabled.',
                            //this field will generate a toggle linked to the 'necessary' category            
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Analytics',
                            description: 'Help us understand how visitors interact with our website. All data is anonymized.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'More information',
                            description: 'For questions about our cookie policy, please <a href="https://support.microsoft.com/contactus/">contact us</a>.'
                        }
                    ]
                }
            },
            de: {
                consentModal: {
                    title: 'Diese Website verwendet Cookies',
                    description: 'Wir verwenden Cookies, um Ihr Browsing-Erlebnis zu verbessern, den Website-Traffic zu analysieren und unsere Dienste zu verbessern. Indem Sie auf "Alle akzeptieren" klicken, stimmen Sie unserer Verwendung von Cookies zu.',
                    acceptAllBtn: 'Alle akzeptieren',
                    acceptNecessaryBtn: 'Alle ablehnen',
                    showPreferencesBtn: 'Einstellungen verwalten',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Datenschutz & Cookies</a>'
                },
                preferencesModal: {
                    title: 'Cookie-Einstellungen',
                    acceptAllBtn: 'Alle akzeptieren',
                    acceptNecessaryBtn: 'Alle ablehnen',
                    savePreferencesBtn: 'Einstellungen speichern',
                    closeIconLabel: 'Schließen',
                    sections: [
                        {
                            title: 'Cookie-Verwendung',
                            description: 'Wir verwenden Cookies, um wesentliche Website-Funktionen bereitzustellen und Ihre Erfahrung zu verbessern.'
                        },
                        {
                            title: 'Unbedingt erforderlich',
                            description: 'Erforderlich, damit die Website ordnungsgemäß funktioniert. Diese können nicht deaktiviert werden.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Analyse',
                            description: 'Helfen Sie uns zu verstehen, wie Besucher mit unserer Website interagieren. Alle Daten werden anonymisiert.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Weitere Informationen',
                            description: 'Bei Fragen zu unserer Cookie-Richtlinie <a href="https://support.microsoft.com/contactus/">kontaktieren Sie uns bitte</a>.'
                        }
                    ]
                }
            },
            es: {
                consentModal: {
                    title: 'Este sitio utiliza cookies',
                    description: 'Utilizamos cookies para mejorar su experiencia de navegación, analizar el tráfico del sitio y mejorar nuestros servicios. Al hacer clic en "Aceptar todo", acepta nuestro uso de cookies.',
                    acceptAllBtn: 'Aceptar todo',
                    acceptNecessaryBtn: 'Rechazar todo',
                    showPreferencesBtn: 'Administrar preferencias',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Privacidad y cookies</a>'
                },
                preferencesModal: {
                    title: 'Preferencias de cookies',
                    acceptAllBtn: 'Aceptar todo',
                    acceptNecessaryBtn: 'Rechazar todo',
                    savePreferencesBtn: 'Guardar preferencias',
                    closeIconLabel: 'Cerrar',
                    sections: [
                        {
                            title: 'Uso de cookies',
                            description: 'Utilizamos cookies para proporcionar funcionalidad esencial del sitio web y mejorar su experiencia.'
                        },
                        {
                            title: 'Estrictamente necesarias',
                            description: 'Necesarias para que el sitio web funcione correctamente. No se pueden desactivar.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Analíticas',
                            description: 'Nos ayudan a entender cómo los visitantes interactúan con nuestro sitio web. Todos los datos son anónimos.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Más información',
                            description: 'Para preguntas sobre nuestra política de cookies, por favor <a href="https://support.microsoft.com/contactus/">contáctenos</a>.'
                        }
                    ]
                }
            },
            ja: {
                consentModal: {
                    title: 'このサイトはクッキーを使用しています',
                    description: 'ブラウジング体験を向上させ、サイトのトラフィックを分析し、サービスを改善するためにクッキーを使用しています。「すべて受け入れる」をクリックすると、クッキーの使用に同意したことになります。',
                    acceptAllBtn: 'すべて受け入れる',
                    acceptNecessaryBtn: 'すべて拒否',
                    showPreferencesBtn: '設定を管理',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">プライバシーとクッキー</a>'
                },
                preferencesModal: {
                    title: 'クッキーの設定',
                    acceptAllBtn: 'すべて受け入れる',
                    acceptNecessaryBtn: 'すべて拒否',
                    savePreferencesBtn: '設定を保存',
                    closeIconLabel: '閉じる',
                    sections: [
                        {
                            title: 'クッキーの使用',
                            description: 'ウェブサイトの基本的な機能を提供し、ユーザー体験を向上させるためにクッキーを使用しています。'
                        },
                        {
                            title: '必須',
                            description: 'ウェブサイトが正常に機能するために必要です。無効にすることはできません。',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: '分析',
                            description: '訪問者がウェブサイトとどのようにやり取りしているかを理解するのに役立ちます。すべてのデータは匿名化されています。',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: '詳細情報',
                            description: 'クッキーポリシーに関するご質問は、<a href="https://support.microsoft.com/contactus/">お問い合わせください</a>。'
                        }
                    ]
                }
            },
            fr: {
                consentModal: {
                    title: 'Ce site utilise des cookies',
                    description: 'Nous utilisons des cookies pour améliorer votre expérience de navigation, analyser le trafic du site et améliorer nos services. En cliquant sur "Tout accepter", vous consentez à notre utilisation de cookies.',
                    acceptAllBtn: 'Tout accepter',
                    acceptNecessaryBtn: 'Tout rejeter',
                    showPreferencesBtn: 'Gérer les préférences',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Confidentialité et cookies</a>'
                },
                preferencesModal: {
                    title: 'Préférences des cookies',
                    acceptAllBtn: 'Tout accepter',
                    acceptNecessaryBtn: 'Tout rejeter',
                    savePreferencesBtn: 'Enregistrer les préférences',
                    closeIconLabel: 'Fermer',
                    sections: [
                        {
                            title: 'Utilisation des cookies',
                            description: 'Nous utilisons des cookies pour fournir des fonctionnalités essentielles du site web et améliorer votre expérience.'
                        },
                        {
                            title: 'Strictement nécessaires',
                            description: 'Nécessaires au bon fonctionnement du site web. Ils ne peuvent pas être désactivés.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Analytiques',
                            description: 'Nous aident à comprendre comment les visiteurs interagissent avec notre site web. Toutes les données sont anonymisées.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Plus d\'informations',
                            description: 'Pour toute question concernant notre politique en matière de cookies, veuillez <a href="https://support.microsoft.com/contactus/">nous contacter</a>.'
                        }
                    ]
                }
            },
            it: {
                consentModal: {
                    title: 'Questo sito utilizza i cookie',
                    description: 'Utilizziamo i cookie per migliorare la tua esperienza di navigazione, analizzare il traffico del sito e migliorare i nostri servizi. Cliccando su "Accetta tutto", acconsenti al nostro utilizzo dei cookie.',
                    acceptAllBtn: 'Accetta tutto',
                    acceptNecessaryBtn: 'Rifiuta tutto',
                    showPreferencesBtn: 'Gestisci preferenze',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Privacy e cookie</a>'
                },
                preferencesModal: {
                    title: 'Preferenze dei cookie',
                    acceptAllBtn: 'Accetta tutto',
                    acceptNecessaryBtn: 'Rifiuta tutto',
                    savePreferencesBtn: 'Salva preferenze',
                    closeIconLabel: 'Chiudi',
                    sections: [
                        {
                            title: 'Utilizzo dei cookie',
                            description: 'Utilizziamo i cookie per fornire funzionalità essenziali del sito web e migliorare la tua esperienza.'
                        },
                        {
                            title: 'Strettamente necessari',
                            description: 'Necessari per il corretto funzionamento del sito web. Non possono essere disabilitati.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Analitici',
                            description: 'Ci aiutano a capire come i visitatori interagiscono con il nostro sito web. Tutti i dati sono anonimizzati.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Ulteriori informazioni',
                            description: 'Per domande sulla nostra politica sui cookie, <a href="https://support.microsoft.com/contactus/">contattaci</a>.'
                        }
                    ]
                }
            },
            id: {
                consentModal: {
                    title: 'Situs ini menggunakan cookie',
                    description: 'Kami menggunakan cookie untuk meningkatkan pengalaman browsing Anda, menganalisis lalu lintas situs, dan meningkatkan layanan kami. Dengan mengklik "Terima semua", Anda menyetujui penggunaan cookie kami.',
                    acceptAllBtn: 'Terima semua',
                    acceptNecessaryBtn: 'Tolak semua',
                    showPreferencesBtn: 'Kelola preferensi',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Privasi & Cookie</a>'
                },
                preferencesModal: {
                    title: 'Preferensi cookie',
                    acceptAllBtn: 'Terima semua',
                    acceptNecessaryBtn: 'Tolak semua',
                    savePreferencesBtn: 'Simpan preferensi',
                    closeIconLabel: 'Tutup',
                    sections: [
                        {
                            title: 'Penggunaan cookie',
                            description: 'Kami menggunakan cookie untuk menyediakan fungsi penting situs web dan meningkatkan pengalaman Anda.'
                        },
                        {
                            title: 'Sangat diperlukan',
                            description: 'Diperlukan agar situs web berfungsi dengan baik. Ini tidak dapat dinonaktifkan.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Analitik',
                            description: 'Membantu kami memahami bagaimana pengunjung berinteraksi dengan situs web kami. Semua data dianonimkan.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Informasi lebih lanjut',
                            description: 'Untuk pertanyaan tentang kebijakan cookie kami, silakan <a href="https://support.microsoft.com/contactus/">hubungi kami</a>.'
                        }
                    ]
                }
            },
            'zh-cn': {
                consentModal: {
                    title: '本网站使用Cookie',
                    description: '我们使用Cookie来改善您的浏览体验，分析网站流量并改进我们的服务。点击"全部接受"即表示您同意我们使用Cookie。',
                    acceptAllBtn: '全部接受',
                    acceptNecessaryBtn: '全部拒绝',
                    showPreferencesBtn: '管理偏好设置',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">隐私和Cookie</a>'
                },
                preferencesModal: {
                    title: 'Cookie偏好设置',
                    acceptAllBtn: '全部接受',
                    acceptNecessaryBtn: '全部拒绝',
                    savePreferencesBtn: '保存偏好设置',
                    closeIconLabel: '关闭',
                    sections: [
                        {
                            title: 'Cookie使用',
                            description: '我们使用Cookie来提供基本的网站功能并改善您的体验。'
                        },
                        {
                            title: '严格必要',
                            description: '网站正常运行所必需的。这些无法禁用。',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: '分析',
                            description: '帮助我们了解访问者如何与我们的网站互动。所有数据都已匿名化。',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: '更多信息',
                            description: '有关我们Cookie政策的问题，请<a href="https://support.microsoft.com/contactus/">联系我们</a>。'
                        }
                    ]
                }
            },
            'pt-br': {
                consentModal: {
                    title: 'Este site usa cookies',
                    description: 'Usamos cookies para melhorar sua experiência de navegação, analisar o tráfego do site e melhorar nossos serviços. Ao clicar em "Aceitar tudo", você consente com nosso uso de cookies.',
                    acceptAllBtn: 'Aceitar tudo',
                    acceptNecessaryBtn: 'Rejeitar tudo',
                    showPreferencesBtn: 'Gerenciar preferências',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Privacidade e Cookies</a>'
                },
                preferencesModal: {
                    title: 'Preferências de cookies',
                    acceptAllBtn: 'Aceitar tudo',
                    acceptNecessaryBtn: 'Rejeitar tudo',
                    savePreferencesBtn: 'Salvar preferências',
                    closeIconLabel: 'Fechar',
                    sections: [
                        {
                            title: 'Uso de cookies',
                            description: 'Usamos cookies para fornecer funcionalidade essencial do site e melhorar sua experiência.'
                        },
                        {
                            title: 'Estritamente necessários',
                            description: 'Necessários para que o site funcione corretamente. Estes não podem ser desativados.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Análise',
                            description: 'Nos ajudam a entender como os visitantes interagem com nosso site. Todos os dados são anonimizados.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Mais informações',
                            description: 'Para dúvidas sobre nossa política de cookies, por favor <a href="https://support.microsoft.com/contactus/">entre em contato</a>.'
                        }
                    ]
                }
            },
            'pt-pt': {
                consentModal: {
                    title: 'Este site utiliza cookies',
                    description: 'Utilizamos cookies para melhorar a sua experiência de navegação, analisar o tráfego do site e melhorar os nossos serviços. Ao clicar em "Aceitar tudo", consente a nossa utilização de cookies.',
                    acceptAllBtn: 'Aceitar tudo',
                    acceptNecessaryBtn: 'Rejeitar tudo',
                    showPreferencesBtn: 'Gerir preferências',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Privacidade e Cookies</a>'
                },
                preferencesModal: {
                    title: 'Preferências de cookies',
                    acceptAllBtn: 'Aceitar tudo',
                    acceptNecessaryBtn: 'Rejeitar tudo',
                    savePreferencesBtn: 'Guardar preferências',
                    closeIconLabel: 'Fechar',
                    sections: [
                        {
                            title: 'Utilização de cookies',
                            description: 'Utilizamos cookies para fornecer funcionalidades essenciais do site e melhorar a sua experiência.'
                        },
                        {
                            title: 'Estritamente necessários',
                            description: 'Necessários para que o site funcione corretamente. Não podem ser desativados.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Análise',
                            description: 'Ajudam-nos a compreender como os visitantes interagem com o nosso site. Todos os dados são anonimizados.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Mais informações',
                            description: 'Para questões sobre a nossa política de cookies, por favor <a href="https://support.microsoft.com/contactus/">contacte-nos</a>.'
                        }
                    ]
                }
            },
            ko: {
                consentModal: {
                    title: '이 사이트는 쿠키를 사용합니다',
                    description: '브라우징 경험을 향상시키고 사이트 트래픽을 분석하며 서비스를 개선하기 위해 쿠키를 사용합니다. "모두 수락"을 클릭하면 쿠키 사용에 동의하는 것입니다.',
                    acceptAllBtn: '모두 수락',
                    acceptNecessaryBtn: '모두 거부',
                    showPreferencesBtn: '기본 설정 관리',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">개인정보 및 쿠키</a>'
                },
                preferencesModal: {
                    title: '쿠키 기본 설정',
                    acceptAllBtn: '모두 수락',
                    acceptNecessaryBtn: '모두 거부',
                    savePreferencesBtn: '기본 설정 저장',
                    closeIconLabel: '닫기',
                    sections: [
                        {
                            title: '쿠키 사용',
                            description: '필수 웹사이트 기능을 제공하고 사용자 경험을 개선하기 위해 쿠키를 사용합니다.'
                        },
                        {
                            title: '필수',
                            description: '웹사이트가 제대로 작동하는 데 필요합니다. 비활성화할 수 없습니다.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: '분석',
                            description: '방문자가 웹사이트와 상호 작용하는 방식을 이해하는 데 도움이 됩니다. 모든 데이터는 익명화됩니다.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: '추가 정보',
                            description: '쿠키 정책에 대한 질문은 <a href="https://support.microsoft.com/contactus/">문의하십시오</a>.'
                        }
                    ]
                }
            },
            tr: {
                consentModal: {
                    title: 'Bu site çerez kullanıyor',
                    description: 'Gezinme deneyiminizi geliştirmek, site trafiğini analiz etmek ve hizmetlerimizi iyileştirmek için çerezler kullanıyoruz. "Tümünü kabul et"i tıklayarak çerez kullanımımızı onaylamış olursunuz.',
                    acceptAllBtn: 'Tümünü kabul et',
                    acceptNecessaryBtn: 'Tümünü reddet',
                    showPreferencesBtn: 'Tercihleri yönet',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Gizlilik ve Tanımlama Bilgileri</a>'
                },
                preferencesModal: {
                    title: 'Çerez tercihleri',
                    acceptAllBtn: 'Tümünü kabul et',
                    acceptNecessaryBtn: 'Tümünü reddet',
                    savePreferencesBtn: 'Tercihleri kaydet',
                    closeIconLabel: 'Kapat',
                    sections: [
                        {
                            title: 'Çerez kullanımı',
                            description: 'Temel web sitesi işlevselliği sağlamak ve deneyiminizi geliştirmek için çerezler kullanıyoruz.'
                        },
                        {
                            title: 'Kesinlikle gerekli',
                            description: 'Web sitesinin düzgün çalışması için gereklidir. Bunlar devre dışı bırakılamaz.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Analitik',
                            description: 'Ziyaretçilerin web sitemizle nasıl etkileşime girdiğini anlamamıza yardımcı olur. Tüm veriler anonimleştirilir.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Daha fazla bilgi',
                            description: 'Çerez politikamız hakkında sorularınız için lütfen <a href="https://support.microsoft.com/contactus/">bizimle iletişime geçin</a>.'
                        }
                    ]
                }
            },
            ru: {
                consentModal: {
                    title: 'Этот сайт использует файлы cookie',
                    description: 'Мы используем файлы cookie для улучшения вашего опыта просмотра, анализа трафика сайта и улучшения наших услуг. Нажимая "Принять все", вы соглашаетесь на использование нами файлов cookie.',
                    acceptAllBtn: 'Принять все',
                    acceptNecessaryBtn: 'Отклонить все',
                    showPreferencesBtn: 'Управление настройками',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Конфиденциальность и файлы cookie</a>'
                },
                preferencesModal: {
                    title: 'Настройки файлов cookie',
                    acceptAllBtn: 'Принять все',
                    acceptNecessaryBtn: 'Отклонить все',
                    savePreferencesBtn: 'Сохранить настройки',
                    closeIconLabel: 'Закрыть',
                    sections: [
                        {
                            title: 'Использование файлов cookie',
                            description: 'Мы используем файлы cookie для обеспечения основных функций веб-сайта и улучшения вашего опыта.'
                        },
                        {
                            title: 'Строго необходимые',
                            description: 'Необходимы для правильной работы веб-сайта. Их нельзя отключить.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Аналитика',
                            description: 'Помогают нам понять, как посетители взаимодействуют с нашим веб-сайтом. Все данные анонимизированы.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Дополнительная информация',
                            description: 'По вопросам о нашей политике в отношении файлов cookie, пожалуйста, <a href="https://support.microsoft.com/contactus/">свяжитесь с нами</a>.'
                        }
                    ]
                }
            },
            hi: {
                consentModal: {
                    title: 'यह साइट कुकीज़ का उपयोग करती है',
                    description: 'हम आपके ब्राउज़िंग अनुभव को बेहतर बनाने, साइट ट्रैफ़िक का विश्लेषण करने और अपनी सेवाओं को बेहतर बनाने के लिए कुकीज़ का उपयोग करते हैं। "सभी स्वीकार करें" पर क्लिक करके, आप हमारे कुकीज़ के उपयोग के लिए सहमति देते हैं।',
                    acceptAllBtn: 'सभी स्वीकार करें',
                    acceptNecessaryBtn: 'सभी अस्वीकार करें',
                    showPreferencesBtn: 'प्राथमिकताएँ प्रबंधित करें',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">गोपनीयता और कुकीज़</a>'
                },
                preferencesModal: {
                    title: 'कुकी प्राथमिकताएँ',
                    acceptAllBtn: 'सभी स्वीकार करें',
                    acceptNecessaryBtn: 'सभी अस्वीकार करें',
                    savePreferencesBtn: 'प्राथमिकताएँ सहेजें',
                    closeIconLabel: 'बंद करें',
                    sections: [
                        {
                            title: 'कुकी उपयोग',
                            description: 'हम आवश्यक वेबसाइट कार्यक्षमता प्रदान करने और आपके अनुभव को बेहतर बनाने के लिए कुकीज़ का उपयोग करते हैं।'
                        },
                        {
                            title: 'सख्ती से आवश्यक',
                            description: 'वेबसाइट के ठीक से काम करने के लिए आवश्यक। इन्हें अक्षम नहीं किया जा सकता।',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'विश्लेषण',
                            description: 'आगंतुकों के हमारी वेबसाइट के साथ कैसे इंटरैक्ट करते हैं, यह समझने में हमारी मदद करें। सभी डेटा गुमनाम है।',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'अधिक जानकारी',
                            description: 'हमारी कुकी नीति के बारे में प्रश्नों के लिए, कृपया <a href="https://support.microsoft.com/contactus/">हमसे संपर्क करें</a>।'
                        }
                    ]
                }
            },
            da: {
                consentModal: {
                    title: 'Dette site bruger cookies',
                    description: 'Vi bruger cookies til at forbedre din browseroplevelse, analysere webstedstrafik og forbedre vores tjenester. Ved at klikke på "Acceptér alle" giver du samtykke til vores brug af cookies.',
                    acceptAllBtn: 'Acceptér alle',
                    acceptNecessaryBtn: 'Afvis alle',
                    showPreferencesBtn: 'Administrer præferencer',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Beskyttelse af personlige oplysninger og cookies</a>'
                },
                preferencesModal: {
                    title: 'Cookie-præferencer',
                    acceptAllBtn: 'Acceptér alle',
                    acceptNecessaryBtn: 'Afvis alle',
                    savePreferencesBtn: 'Gem præferencer',
                    closeIconLabel: 'Luk',
                    sections: [
                        {
                            title: 'Cookie-brug',
                            description: 'Vi bruger cookies til at levere essentiel webstedsfunktionalitet og forbedre din oplevelse.'
                        },
                        {
                            title: 'Strengt nødvendige',
                            description: 'Krævet for at webstedet fungerer korrekt. Disse kan ikke deaktiveres.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Analyse',
                            description: 'Hjælper os med at forstå, hvordan besøgende interagerer med vores websted. Alle data er anonymiserede.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Mere information',
                            description: 'For spørgsmål om vores cookie-politik, bedes du <a href="https://support.microsoft.com/contactus/">kontakte os</a>.'
                        }
                    ]
                }
            },
            uk: {
                consentModal: {
                    title: 'Цей сайт використовує файли cookie',
                    description: 'Ми використовуємо файли cookie для покращення вашого досвіду перегляду, аналізу трафіку сайту та покращення наших послуг. Натискаючи "Прийняти все", ви погоджуєтесь на використання нами файлів cookie.',
                    acceptAllBtn: 'Прийняти все',
                    acceptNecessaryBtn: 'Відхилити все',
                    showPreferencesBtn: 'Керувати налаштуваннями',
                    footer: '<a href="https://go.microsoft.com/fwlink/?LinkId=521839">Конфіденційність і файли cookie</a>'
                },
                preferencesModal: {
                    title: 'Налаштування файлів cookie',
                    acceptAllBtn: 'Прийняти все',
                    acceptNecessaryBtn: 'Відхилити все',
                    savePreferencesBtn: 'Зберегти налаштування',
                    closeIconLabel: 'Закрити',
                    sections: [
                        {
                            title: 'Використання файлів cookie',
                            description: 'Ми використовуємо файли cookie для забезпечення основних функцій веб-сайту та покращення вашого досвіду.'
                        },
                        {
                            title: 'Суворо необхідні',
                            description: 'Необхідні для правильної роботи веб-сайту. Їх не можна вимкнути.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Аналітика',
                            description: 'Допомагають нам зрозуміти, як відвідувачі взаємодіють з нашим веб-сайтом. Усі дані анонімізовані.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Додаткова інформація',
                            description: 'З питань про нашу політику щодо файлів cookie, будь ласка, <a href="https://support.microsoft.com/contactus/">зв\'яжіться з нами</a>.'
                        }
                    ]
                }
            }
        }
    }
};