/**
 * Frase del día — la misma para todo el mundo durante un día natural y cambia
 * sola al día siguiente.
 *
 * Se elige por el día del año (no al azar) por dos razones: no baila en cada
 * render y, sobre todo, no cambia entre el HTML del servidor y el del cliente.
 * Aun así el panel la calcula ya montado, porque la zona horaria del servidor
 * y la del navegador pueden caer en días distintos.
 */

export type DailyQuote = {
  es: string
  en: string
  author: string
}

/** Frases sobre educación, ingeniería y oficio. Una por día del año, rotando. */
const QUOTES: DailyQuote[] = [
  {
    es: 'La educación es el arma más poderosa que puedes usar para cambiar el mundo.',
    en: 'Education is the most powerful weapon which you can use to change the world.',
    author: 'Nelson Mandela',
  },
  {
    es: 'Dime y lo olvido, enséñame y lo recuerdo, involúcrame y lo aprendo.',
    en: 'Tell me and I forget, teach me and I remember, involve me and I learn.',
    author: 'Benjamin Franklin',
  },
  {
    es: 'El objetivo de la educación es preparar a los jóvenes para educarse a sí mismos toda la vida.',
    en: 'The object of education is to prepare the young to educate themselves throughout their lives.',
    author: 'Robert M. Hutchins',
  },
  {
    es: 'La simplicidad es requisito previo de la fiabilidad.',
    en: 'Simplicity is a prerequisite for reliability.',
    author: 'Edsger W. Dijkstra',
  },
  {
    es: 'Los programas deben escribirse para que los lean personas, y solo de paso para que los ejecute una máquina.',
    en: 'Programs must be written for people to read, and only incidentally for machines to execute.',
    author: 'Harold Abelson',
  },
  {
    es: 'Un experto es alguien que ya cometió todos los errores posibles en un campo muy estrecho.',
    en: 'An expert is a person who has made all the mistakes that can be made in a very narrow field.',
    author: 'Niels Bohr',
  },
  {
    es: 'Enseñar es aprender dos veces.',
    en: 'To teach is to learn twice.',
    author: 'Joseph Joubert',
  },
  {
    es: 'La ciencia es conocimiento organizado; la sabiduría es vida organizada.',
    en: 'Science is organized knowledge. Wisdom is organized life.',
    author: 'Immanuel Kant',
  },
  {
    es: 'La mejor forma de predecir el futuro es inventarlo.',
    en: 'The best way to predict the future is to invent it.',
    author: 'Alan Kay',
  },
  {
    es: 'La ingeniería es el arte de dirigir las grandes fuentes de energía de la naturaleza para el uso y la conveniencia del ser humano.',
    en: 'Engineering is the art of directing the great sources of power in nature for the use and convenience of people.',
    author: 'Thomas Tredgold',
  },
  {
    es: 'No he fracasado. Solo encontré diez mil maneras que no funcionan.',
    en: 'I have not failed. I have just found ten thousand ways that will not work.',
    author: 'Thomas A. Edison',
  },
  {
    es: 'La disciplina es el puente entre las metas y los logros.',
    en: 'Discipline is the bridge between goals and accomplishment.',
    author: 'Jim Rohn',
  },
  {
    es: 'Lo que sabemos es una gota; lo que ignoramos, un océano.',
    en: 'What we know is a drop, what we do not know is an ocean.',
    author: 'Isaac Newton',
  },
  {
    es: 'La creatividad es la inteligencia divirtiéndose.',
    en: 'Creativity is intelligence having fun.',
    author: 'Albert Einstein',
  },
  {
    es: 'Primero resuelve el problema; después escribe el código.',
    en: 'First, solve the problem. Then, write the code.',
    author: 'John Johnson',
  },
  {
    es: 'La calidad nunca es un accidente: siempre es el resultado de un esfuerzo inteligente.',
    en: 'Quality is never an accident; it is always the result of intelligent effort.',
    author: 'John Ruskin',
  },
  {
    es: 'Educar la mente sin educar el corazón no es educar en absoluto.',
    en: 'Educating the mind without educating the heart is no education at all.',
    author: 'Aristóteles',
  },
  {
    es: 'Cualquiera puede escribir código que una máquina entienda; los buenos programadores escriben código que los humanos entienden.',
    en: 'Any fool can write code that a computer understands. Good programmers write code that humans can understand.',
    author: 'Martin Fowler',
  },
  {
    es: 'El aprendizaje es un tesoro que seguirá a su dueño a todas partes.',
    en: 'Learning is a treasure that will follow its owner everywhere.',
    author: 'Proverbio chino',
  },
  {
    es: 'La medida de la inteligencia es la capacidad de cambiar.',
    en: 'The measure of intelligence is the ability to change.',
    author: 'Albert Einstein',
  },
  {
    es: 'Hazlo funcionar, hazlo correcto, hazlo rápido. En ese orden.',
    en: 'Make it work, make it right, make it fast. In that order.',
    author: 'Kent Beck',
  },
  {
    es: 'Un buen maestro puede inspirar esperanza, encender la imaginación e inculcar el amor por aprender.',
    en: 'A good teacher can inspire hope, ignite the imagination, and instill a love of learning.',
    author: 'Brad Henry',
  },
  {
    es: 'La curiosidad es la mecha de la vela del aprendizaje.',
    en: 'Curiosity is the wick in the candle of learning.',
    author: 'William A. Ward',
  },
  {
    es: 'Lo importante es no dejar de hacerse preguntas.',
    en: 'The important thing is not to stop questioning.',
    author: 'Albert Einstein',
  },
  {
    es: 'La perfección se alcanza no cuando no hay nada más que añadir, sino cuando no hay nada más que quitar.',
    en: 'Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.',
    author: 'Antoine de Saint-Exupéry',
  },
  {
    es: 'Enseñar no es transferir conocimiento, sino crear las posibilidades para producirlo.',
    en: 'Teaching is not transferring knowledge but creating the possibilities for its production.',
    author: 'Paulo Freire',
  },
  {
    es: 'El código es como el humor: si tienes que explicarlo, es malo.',
    en: 'Code is like humor. When you have to explain it, it is bad.',
    author: 'Cory House',
  },
  {
    es: 'Nunca consideres el estudio como una obligación, sino como la oportunidad de entrar en el bello mundo del saber.',
    en: 'Never regard study as a duty, but as an enviable opportunity to enter the beautiful world of knowledge.',
    author: 'Albert Einstein',
  },
  {
    es: 'El experto en cualquier cosa fue alguna vez un principiante.',
    en: 'An expert in anything was once a beginner.',
    author: 'Helen Hayes',
  },
  {
    es: 'La constancia vence lo que la dicha no alcanza.',
    en: 'Perseverance achieves what luck cannot.',
    author: 'Simón Bolívar',
  },
  {
    es: 'La tecnología es solo una herramienta: para motivar a los niños y hacer que trabajen juntos, el maestro es lo más importante.',
    en: 'Technology is just a tool. For getting kids working together and motivating them, the teacher is the most important.',
    author: 'Bill Gates',
  },
]

/** Día del año (1–366) en hora local. */
export function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000)
}

/** La frase que toca hoy (o la de la fecha que se pase). */
export function quoteOfTheDay(d: Date): DailyQuote {
  return QUOTES[dayOfYear(d) % QUOTES.length]
}
