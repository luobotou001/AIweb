'use client';

import {
  CheckCircle2,
  Clock,
  Lock,
  Shield,
  Sparkles,
  Star,
} from 'lucide-react';
import PalmReadingBot from './PalmReadingBot';

interface PalmReadingHomeProps {
  locale: string;
}

export default function PalmReadingHome({ locale }: PalmReadingHomeProps) {
  // const stats = [
  //   { value: '10,000+', label: 'Palm Readings' },
  //   { value: '4.8/5', label: 'User Rating' },
  //   { value: '98%', label: 'Accuracy Rate' },
  // ];

  // const testimonials = [
  //   {
  //     name: 'Sarah M.',
  //     location: 'New York, USA',
  //     content:
  //       "The accuracy was incredible! The reading revealed insights about my personality that I hadn't even shared with close friends. The AI picked up on my creative nature and career path perfectly.",
  //     time: '2 days ago',
  //   },
  //   {
  //     name: 'Michael R.',
  //     location: 'London, UK',
  //     content:
  //       'I was skeptical at first, but the detailed analysis of my life line and future predictions were spot-on. The chat feature allowed me to ask specific questions about my career path.',
  //     time: '1 week ago',
  //   },
  //   {
  //     name: 'Priya K.',
  //     location: 'Mumbai, India',
  //     content:
  //       'Amazing technology! The reading identified my relationship patterns and gave me valuable insights about my future. The instant results and privacy protection are fantastic.',
  //     time: '3 days ago',
  //   },
  //   {
  //     name: 'David L.',
  //     location: 'Toronto, Canada',
  //     content:
  //       'The AI analysis was thorough and detailed. It correctly identified my analytical nature and provided insights about my health line that prompted me to make positive lifestyle changes.',
  //     time: '5 days ago',
  //   },
  //   {
  //     name: 'Emma W.',
  //     location: 'Sydney, Australia',
  //     content:
  //       'Fast, accurate, and surprisingly detailed! The reading helped me understand my emotional patterns and gave me clarity about my upcoming life decisions. Highly recommended!',
  //     time: '1 day ago',
  //   },
  //   {
  //     name: 'Carlos M.',
  //     location: 'São Paulo, Brazil',
  //     content:
  //       'The technology is incredible! It analyzed my fate line and predicted changes in my career that actually happened weeks later. The accuracy rate is genuinely impressive.',
  //     time: '4 days ago',
  //   },
  // ];

  // const features = [
  //   {
  //     icon: Shield,
  //     title: '100% Secure',
  //     description: 'SSL Encrypted',
  //   },
  //   {
  //     icon: Lock,
  //     title: 'Privacy First',
  //     description: 'Never Stored',
  //   },
  //   {
  //     icon: Clock,
  //     title: 'Instant Results',
  //     description: 'Under 30 Seconds',
  //   },
  //   {
  //     icon: CheckCircle2,
  //     title: '24/7 Support',
  //     description: 'Always Available',
  //   },
  // ];

  // const steps = [
  //   {
  //     number: '1',
  //     title: 'Capture',
  //     description: "Take a clear, well-lit photo of your dominant hand's palm",
  //   },
  //   {
  //     number: '2',
  //     title: 'Analyze',
  //     description: 'Our advanced AI examines your palm lines and patterns',
  //   },
  //   {
  //     number: '3',
  //     title: 'Discover',
  //     description:
  //       'Receive detailed insights about your personality and future',
  //   },
  // ];

  // const specialFeatures = [
  //   {
  //     icon: Sparkles,
  //     title: 'AI-Powered Analysis',
  //     description:
  //       'Advanced machine learning algorithms trained on palmistry traditions',
  //   },
  //   {
  //     icon: Clock,
  //     title: 'Instant Results',
  //     description: 'Get your detailed palm reading in seconds, not hours',
  //   },
  //   {
  //     icon: Lock,
  //     title: 'Complete Privacy',
  //     description: 'Your images are processed securely and never stored',
  //   },
  //   {
  //     icon: Star,
  //     title: 'Interactive Chat',
  //     description: 'Ask follow-up questions about your reading',
  //   },
  // ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-950">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-12 md:py-20">
        <div className="text-center space-y-6 mb-12">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Discover Your Destiny
          </h1>
          <h2 className="text-2xl md:text-3xl font-semibold text-muted-foreground">
            AI-Powered Palm Reading
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Unlock the ancient secrets hidden in your palm lines with
            cutting-edge artificial intelligence. Get instant insights about
            your personality, relationships, career, and future.
          </p>
        </div>

        {/* Main Upload Section */}
        <div className="max-w-6xl mx-auto mb-16">
          <div className="bg-gray-700/50 border border-gray-600/30 rounded-lg p-6 md:p-8 shadow-xl">
            <PalmReadingBot />
          </div>
        </div>

        {/* Stats Section */}
        {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-16">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center p-6 rounded-lg bg-muted/80 border border-border/50"
            >
              <div className="text-3xl md:text-4xl font-bold mb-2">
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div> */}

        {/* Features Grid */}
        {/* <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mb-16">
          {features.map((feature, index) => (
            <div
              key={index}
              className="text-center p-4 rounded-lg bg-muted/80 border border-border/50"
            >
              <feature.icon className="size-6 mx-auto mb-2 text-primary" />
              <div className="text-sm font-medium mb-1">{feature.title}</div>
              <div className="text-xs text-muted-foreground">
                {feature.description}
              </div>
            </div>
          ))}
        </div> */}
      </div>

      {/* Testimonials Section */}
      {/* <div className="bg-purple-950/20 py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Trusted by Thousands Worldwide
            </h2>
            <p className="text-muted-foreground">
              Real experiences from our satisfied users
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="p-6 rounded-lg bg-background border shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-semibold">
                      {testimonial.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {testimonial.location}
                    </div>
                  </div>
                </div>
                <blockquote className="text-sm text-muted-foreground mb-4">
                  &quot;{testimonial.content}&quot;
                </blockquote>
                <div className="text-xs text-muted-foreground">
                  Verified reading from {testimonial.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div> */}

      {/* How It Works Section */}
      {/* <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            How Palmist Works
          </h2>
          <p className="text-muted-foreground">
            Three simple steps to unlock your palm&apos;s secrets
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
          {steps.map((step, index) => (
            <div key={index} className="text-center">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">
                  {step.number}
                </span>
              </div>
              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div> */}

      {/* What Makes Palmist Special Section */}
      {/* <div className="bg-purple-950/20 py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              What Makes Palmist Special
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {specialFeatures.map((feature, index) => (
              <div
                key={index}
                className="p-6 rounded-lg bg-gray-800/50 border border-purple-700/30 shadow-sm"
              >
                <feature.icon className="size-8 mb-4 text-green-400" />
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div> */}

      {/* CTA Section */}
      {/* <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to Discover Your Destiny?
          </h2>
          <p className="text-lg text-muted-foreground">
            Join thousands of users who have unlocked the secrets hidden in
            their palms
          </p>
          <div className="pt-4">
            <a
              href="#upload"
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Start Your Reading Now
            </a>
          </div>
        </div>
      </div> */}
    </div>
  );
}
