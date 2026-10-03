import "dotenv/config";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import {
  Currency,
  PrismaClient,
  ProjectStatus,
  ProposalStatus,
  Role,
} from "../src/generated/prisma/client.js";
import { env } from "../src/config.js";
import { hashPassword } from "../src/auth.js";

const adapter = new PrismaLibSql({ url: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const categories = [
  "Web Development",
  "Mobile Development",
  "UI/UX Design",
  "Graphic Design",
  "Writing",
  "Translation",
  "Marketing",
  "SEO",
  "Video Production",
  "Audio Production",
  "Data Science",
  "Data Entry",
  "Virtual Assistance",
  "Accounting",
  "Legal",
  "Architecture",
  "Engineering",
  "Customer Support",
  "Photography",
  "Business Consulting",
];

const skillNames = [
  "JavaScript",
  "TypeScript",
  "React",
  "React Native",
  "Node.js",
  "Express",
  "Python",
  "Django",
  "Go",
  "Java",
  "SQL",
  "SQLite",
  "PostgreSQL",
  "Prisma",
  "REST API",
  "GraphQL",
  "HTML",
  "CSS",
  "Tailwind CSS",
  "Figma",
  "UI Design",
  "UX Research",
  "Branding",
  "Illustration",
  "Logo Design",
  "Copywriting",
  "Technical Writing",
  "Editing",
  "Proofreading",
  "SEO",
  "Content Strategy",
  "Social Media",
  "Email Marketing",
  "Google Ads",
  "Analytics",
  "Video Editing",
  "Motion Graphics",
  "3D Modeling",
  "Photography",
  "Voiceover",
  "Audio Editing",
  "Data Analysis",
  "Machine Learning",
  "Excel",
  "Data Entry",
  "Virtual Assistance",
  "Bookkeeping",
  "QuickBooks",
  "Customer Service",
  "Project Management",
  "Agile",
  "Research",
  "Translation",
  "English",
  "Burmese",
  "Chinese",
  "Japanese",
  "Korean",
  "French",
  "Spanish",
  "Architecture",
  "AutoCAD",
  "Interior Design",
  "Civil Engineering",
  "Electrical Engineering",
  "Legal Research",
  "Contract Writing",
  "Business Analysis",
  "Presentation Design",
  "Recruiting",
  "Market Research",
  "Product Management",
  "QA Testing",
  "Test Automation",
  "Cybersecurity",
  "DevOps",
  "Docker",
  "AWS",
  "Content Moderation",
  "Technical Support",
];

const projectTitles = [
  "Build a responsive customer portal",
  "Design a modern brand identity",
  "Create a mobile booking experience",
  "Improve our content strategy",
  "Develop an analytics dashboard",
  "Translate product documentation",
  "Launch an SEO campaign",
  "Edit a product explainer video",
  "Set up automated data reporting",
  "Create a polished investor presentation",
];

function currencyFor(index: number): Currency {
  return index % 2 === 0 ? Currency.USD : Currency.MMK;
}

async function main(): Promise<void> {
  await prisma.notification.deleteMany();
  await prisma.review.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.projectSkill.deleteMany();
  await prisma.project.deleteMany();
  await prisma.portfolioItem.deleteMany();
  await prisma.userSkill.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.category.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hashPassword("ArcherDemo123!");
  const admins = await Promise.all(
    Array.from({ length: 3 }, (_, index) =>
      prisma.user.create({
        data: {
          id: `seed-admin-${index + 1}`,
          email: `admin${index + 1}@archer.local`,
          name: `Archer Admin ${index + 1}`,
          passwordHash,
          role: Role.ADMIN,
        },
      }),
    ),
  );
  const clients = await Promise.all(
    Array.from({ length: 30 }, (_, index) =>
      prisma.user.create({
        data: {
          id: `seed-client-${index + 1}`,
          email: `client${index + 1}@archer.local`,
          name: `Demo Client ${index + 1}`,
          passwordHash,
          role: Role.CLIENT,
          location: index % 2 === 0 ? "Yangon" : "New York",
        },
      }),
    ),
  );
  const freelancers = await Promise.all(
    Array.from({ length: 100 }, (_, index) =>
      prisma.user.create({
        data: {
          id: `seed-freelancer-${index + 1}`,
          email: `freelancer${index + 1}@archer.local`,
          name: `Demo Freelancer ${index + 1}`,
          passwordHash,
          role: Role.FREELANCER,
          headline: `${skillNames[index % skillNames.length]} specialist`,
          hourlyRate: String(15 + (index % 35) * 5),
          hourlyCurrency: currencyFor(index),
          availability: index % 3 === 0 ? "BUSY" : "AVAILABLE",
          location: index % 2 === 0 ? "Yangon" : "Mandalay",
        },
      }),
    ),
  );

  const categoryRecords = await Promise.all(
    categories.map((name, index) =>
      prisma.category.create({
        data: { id: `seed-category-${index + 1}`, name },
      }),
    ),
  );
  const skillRecords = await Promise.all(
    skillNames.map((name, index) =>
      prisma.skill.create({ data: { id: `seed-skill-${index + 1}`, name } }),
    ),
  );

  await prisma.userSkill.createMany({
    data: freelancers.flatMap((freelancer, freelancerIndex) =>
      [0, 1, 2].map((offset) => ({
        userId: freelancer.id,
        skillId:
          skillRecords[(freelancerIndex + offset) % skillRecords.length]!.id,
        years: 1 + ((freelancerIndex + offset) % 8),
      })),
    ),
  });

  await prisma.portfolioItem.createMany({
    data: Array.from({ length: 150 }, (_, index) => ({
      id: `seed-portfolio-${index + 1}`,
      userId: freelancers[index % freelancers.length]!.id,
      title: `${skillNames[index % skillNames.length]} portfolio sample`,
      description:
        "A realistic demo portfolio item for local development and UI review.",
      url: `https://portfolio.example.test/work/${index + 1}`,
      imageUrl: `https://images.example.test/portfolio/${index + 1}.jpg`,
    })),
  });

  const projects = await Promise.all(
    Array.from({ length: 300 }, (_, index) => {
      const status = [
        ProjectStatus.PUBLISHED,
        ProjectStatus.PUBLISHED,
        ProjectStatus.IN_PROGRESS,
        ProjectStatus.COMPLETED,
        ProjectStatus.CLOSED,
        ProjectStatus.DRAFT,
      ][index % 6]!;
      return prisma.project.create({
        data: {
          id: `seed-project-${index + 1}`,
          clientId: clients[index % clients.length]!.id,
          categoryId: categoryRecords[index % categoryRecords.length]!.id,
          title: `${projectTitles[index % projectTitles.length]} #${index + 1}`,
          description:
            "This seeded project contains enough detail to exercise discovery, proposal, filtering, and project-management interfaces.",
          minBudget: String(100 + (index % 20) * 25),
          maxBudget: String(500 + (index % 30) * 50),
          currency: currencyFor(index),
          deadline: new Date(Date.now() + (index + 15) * 24 * 60 * 60 * 1000),
          status,
          completedAt: status === ProjectStatus.COMPLETED ? new Date() : null,
          projectSkills: {
            create: [0, 1, 2].map((offset) => ({
              skillId: skillRecords[(index + offset) % skillRecords.length]!.id,
            })),
          },
        },
      });
    }),
  );

  await prisma.proposal.createMany({
    data: Array.from({ length: 600 }, (_, index) => {
      const projectIndex = Math.floor(index / 2);
      const project = projects[projectIndex]!;
      const status =
        project.status === ProjectStatus.COMPLETED
          ? ProposalStatus.ACCEPTED
          : index % 7 === 0
            ? ProposalStatus.SHORTLISTED
            : ProposalStatus.SUBMITTED;
      return {
        id: `seed-proposal-${index + 1}`,
        projectId: project.id,
        freelancerId:
          freelancers[(index + projectIndex) % freelancers.length]!.id,
        coverLetter:
          "I can deliver this project with clear communication, careful implementation, and regular progress updates.",
        proposedPrice: String(150 + (index % 25) * 35),
        currency: project.currency,
        estimatedDuration: `${2 + (index % 6)} weeks`,
        status,
      };
    }),
  });

  await prisma.review.createMany({
    data: Array.from({ length: 150 }, (_, index) => ({
      id: `seed-review-${index + 1}`,
      projectId: projects[index]!.id,
      authorId: clients[index % clients.length]!.id,
      subjectId: freelancers[index % freelancers.length]!.id,
      rating: 3 + (index % 3),
      comment:
        "A reliable demo review for testing ratings, profile summaries, and review lists.",
    })),
  });

  await prisma.notification.createMany({
    data: Array.from({ length: 300 }, (_, index) => ({
      id: `seed-notification-${index + 1}`,
      userId: [...clients, ...freelancers][
        index % (clients.length + freelancers.length)
      ]!.id,
      type: index % 2 === 0 ? "PROPOSAL_SUBMITTED" : "PROJECT_STATUS_CHANGED",
      title:
        index % 2 === 0 ? "New proposal received" : "Project status updated",
      body: "This seeded notification exists for local notification-list and unread-state testing.",
      readAt: index % 4 === 0 ? new Date() : null,
    })),
  });

  console.log(
    `Seeded ${admins.length} admins, ${clients.length} clients, ${freelancers.length} freelancers, ${projects.length} projects, and 600 proposals.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
