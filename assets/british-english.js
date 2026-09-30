(() => {
  const ipa = {
    your: '/jɔː/', pardon: '/ˈpɑːdən/', coat: '/kəʊt/', here: '/hɪə/', sir: '/sɜː/',
    number: '/ˈnʌmbə/', not: '/nɒt/', sorry: '/ˈsɒri/', no: '/nəʊ/', morning: '/ˈmɔːnɪŋ/',
    mister: '/ˈmɪstə/', new: '/njuː/', student: '/ˈstjuːdənt/', german: '/ˈdʒɜːmən/',
    are: '/ɑː/', teacher: '/ˈtiːtʃə/', what: '/wɒt/', job: '/dʒɒb/', keyboard: '/ˈkiːbɔːd/',
    operator: '/ˈɒpəreɪtə/', engineer: '/ˌendʒɪˈnɪə/', hello: '/həˈləʊ/', shirt: '/ʃɜːt/',
    perhaps: '/pəˈhæps/', colour: '/ˈkʌlə/', upstairs: '/ˌʌpˈsteəz/', passport: '/ˈpɑːspɔːt/',
    tourist: '/ˈtʊərɪst/', hardworking: '/ˌhɑːdˈwɜːkɪŋ/', office: '/ˈɒfɪs/', matter: '/ˈmætə/',
    tired: '/ˈtaɪəd/', thirsty: '/ˈθɜːsti/', glass: '/ɡlɑːs/', glasses: '/ˈɡlɑːsɪz/',
    "here's": '/hɪəz/', "there's": '/ðeəz/', "you're": '/jʊə/', "don't": '/dəʊnt/',
    "can't": '/kɑːnt/', "won't": '/wəʊnt/', go: '/ɡəʊ/', going: '/ˈɡəʊɪŋ/', old: '/əʊld/',
    where: '/weə/', woods: '/wʊdz/', town: '/taʊn/', after: '/ˈɑːftə/', last: '/lɑːst/'
  };
  // Curated dialect corrections, not an unreliable global IPA substitution.
  window.britishPhoneticFor = (word, fallback = '', english = '', index) => {
    const key = String(word).toLowerCase().replace(/’/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    const entries = window.BRITISH_PHONETICS?.entries;
    if (entries && Object.hasOwn(entries, `${key}|${english}|${index}`)) return entries[`${key}|${english}|${index}`];
    if (entries && Object.hasOwn(entries, `${key}|${english}`)) return entries[`${key}|${english}`];
    if (entries && Object.hasOwn(entries, key)) return entries[key];
    return ipa[key] || fallback;
  };
  window.configureEnglishSpeech = utterance => {
    utterance.lang = 'en-GB';
    utterance.rate = 0.8;
    const voices = window.speechSynthesis.getVoices();
    const british = voices.filter(voice => /^en[-_]GB$/i.test(voice.lang));
    const voice = british.find(voice => voice.localService) || british[0];
    if (voice) utterance.voice = voice;
    return utterance;
  };
  window.speechSynthesis?.getVoices();
})();
