import { cookies } from "next/headers";
import { Prototype } from "./_components/prototype";
import { LocaleSync } from "./_components/locale-sync";
import { LOCALE_KEY, toLocale } from "@/i18n";

export default async function Home() {
  // The cookie is what a server render can see; `LocaleSync` puts it back in
  // step with localStorage when the two have come apart.
  const locale = toLocale((await cookies()).get(LOCALE_KEY)?.value);

  return (
    <>
      <LocaleSync serverLocale={locale} />
      <Prototype locale={locale} />
    </>
  );
}
