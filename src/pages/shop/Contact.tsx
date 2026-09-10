import { useState, FormEvent } from 'react';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { submitContactMessage, ContactSubmissionError } from '@/services/contact.service';
import { MessageCircleHeart, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';

const MAX_MESSAGE_LENGTH = 3000;

export default function Contact() {
  useSeo({
    title: 'Contact',
    description: 'Contactez Cosmooss : une question sur nos produits naturels et bio ? Envoyez-nous un message.',
    path: '/contact',
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  // Honeypot : champ caché qui doit rester VIDE pour un humain réel.
  const [website, setWebsite] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Honeypot : si rempli → abandon silencieux (jeté comme un succès).
    if (website.trim()) {
      setStatus('success');
      return;
    }

    setStatus('idle');
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      await submitContactMessage({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        subject: subject.trim() || null,
        message: message.trim(),
        website: '',
      });
      setStatus('success');
      setName('');
      setEmail('');
      setPhone('');
      setSubject('');
      setMessage('');
    } catch (error) {
      setStatus('error');
      if (error instanceof ContactSubmissionError && error.status === 429) {
        setErrorMessage('Trop de requêtes. Veuillez réessayer dans quelques minutes.');
      } else {
        setErrorMessage('Une erreur est survenue. Veuillez réessayer.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fef8fa]">
      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-pink-100 text-pink-600 mb-4">
            <MessageCircleHeart className="h-8 w-8" />
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-pink-900">Contactez-nous</h1>
          <p className="text-pink-700/80 mt-2">
            Une question sur nos produits naturels et bio ? Écrivez-nous, nous vous répondrons rapidement.
          </p>
        </div>

        <Card className="border-pink-100 shadow-sm">
          <CardHeader className="border-b border-pink-100">
            <CardTitle className="text-pink-900">Formulaire de contact</CardTitle>
            <CardDescription>
              Les champs marqués d'un astérisque (*) sont obligatoires.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {status === 'success' ? (
              <div className="text-center py-10">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h2 className="text-lg font-bold text-pink-900">Message envoyé !</h2>
                <p className="text-pink-700/80 mt-2">Merci de nous avoir contactés. Nous vous répondrons très vite.</p>
                <Button
                  variant="outline"
                  className="mt-6 border-pink-200 text-pink-700"
                  onClick={() => setStatus('idle')}
                >
                  Envoyer un autre message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-name">Nom *</Label>
                    <Input
                      id="contact-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Votre nom"
                      required
                      maxLength={120}
                      className="border-pink-200"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-email">Email *</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@exemple.com"
                      required
                      maxLength={254}
                      className="border-pink-200"
                    />
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-phone">Téléphone</Label>
                    <Input
                      id="contact-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+2126..."
                      maxLength={30}
                      className="border-pink-200"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-subject">Sujet</Label>
                    <Input
                      id="contact-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Demande d'information"
                      maxLength={200}
                      className="border-pink-200"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-message">Message *</Label>
                  <Textarea
                    id="contact-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Votre message..."
                    required
                    minLength={10}
                    maxLength={MAX_MESSAGE_LENGTH}
                    rows={6}
                    className="border-pink-200 resize-none"
                  />
                  <p className="text-xs text-pink-400 text-right">
                    {message.length}/{MAX_MESSAGE_LENGTH}
                  </p>
                </div>

                {/* Honeypot anti-bot — invisible pour les humains */}
                <div className="hidden" aria-hidden="true">
                  <Label htmlFor="contact-website">Ne pas remplir</Label>
                  <Input
                    id="contact-website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                {status === 'error' && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-pink-400 hover:bg-pink-500 text-white rounded-xl h-12 gap-2 text-sm font-bold shadow-lg"
                >
                  {isSubmitting ? (
                    'Envoi...'
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Envoyer le message
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
