import { initials } from '../lib/format';

interface Props {
  name: string;
  logo?: string | null;
  size?: 'sm' | 'lg';
}

/** Ecusson du club : logo FFF si disponible, sinon initiales. */
export default function Crest({ name, logo, size = 'sm' }: Props) {
  return (
    <span className={`crest${size === 'lg' ? ' crest--lg' : ''}`} title={name}>
      {logo ? <img src={logo} alt="" loading="lazy" /> : initials(name)}
    </span>
  );
}
