-- L'app nativa Zapp Mobile si abbina come dispositivo: serve la piattaforma iOS.
-- `add value` non puo' stare in una transazione che usa il valore: migration a se'.
alter type public.device_platform add value if not exists 'ios';
