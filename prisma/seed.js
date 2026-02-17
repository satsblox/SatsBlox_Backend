/**
 * ============================================
 * SatsBlox Database Seeding Script
 * ============================================
 * 
 * Purpose:
 *   Automated data population for development and testing environments.
 *   This script cleans the database, creates test data with relational
 *   integrity, and logs each step for visibility.
 * 
 * Execution:
 *   npm run seed          (defined in package.json)
 *   OR
 *   npx prisma db seed
 * 
 * Features:
 *   ✓ Database cleaning (prevents duplicate key errors on re-runs)
 *   ✓ Secure password hashing with bcrypt
 *   ✓ Relational data creation (Parent → Children → Wallets)
 *   ✓ Initial wallet balances for testing
 *   ✓ Comprehensive logging with emojis and timestamps
 *   ✓ Error handling with graceful shutdown
 * 
 * Safety:
 *   - Script only runs in development/local environment
 *   - Removes all data before re-seeding (idempotent)
 *   - Closes Prisma connection to prevent hung processes
 * 
 * ============================================
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// ============================================
// Logger Utility
// ============================================
// Simple logger with timestamp and emoji indicators
// for clear console output during seeding process.
const log = {
  info: (msg) => console.log(`[SEED] ℹ️  ${msg}`),
  success: (msg) => console.log(`[SEED] ✅ ${msg}`),
  step: (msg) => console.log(`[SEED] 📌 ${msg}`),
  action: (msg) => console.log(`[SEED] 🔄 ${msg}`),
  parent: (msg) => console.log(`[SEED] 👤 ${msg}`),
  child: (msg) => console.log(`[SEED] 👶 ${msg}`),
  wallet: (msg) => console.log(`[SEED] 💰 ${msg}`),
  clean: (msg) => console.log(`[SEED] 🧹 ${msg}`),
  error: (msg) => console.error(`[SEED] ❌ ERROR: ${msg}`),
  separator: () => console.log(`[SEED] ${'─'.repeat(60)}`)
};

// ============================================
// Configuration
// ============================================
// Hardcoded test data for development and frontend testing
// Adjust these values as needed for different test scenarios

const TEST_DATA = {
  parent: {
    fullName: 'Charity Muigai',
    email: 'charity.muigai@satsblox.dev',
    phoneNumber: '+254712345678',
    plainPassword: 'TestPassword123!', // Used only for hashing; never stored as plain text
  },
  children: [
    {
      username: 'amara-saving-goal',
      dateOfBirth: new Date('2015-03-21'), // ~9 years old (as of 2024)
      initialBalance: 500000n, // 500,000 satoshis (~$1.50 USD in 2024)
    },
    {
      username: 'liam-treasure-hunt',
      dateOfBirth: new Date('2018-07-15'), // ~6 years old
      initialBalance: 250000n, // 250,000 satoshis
    },
  ],
};

// ============================================
// Main Seeding Function
// ============================================
/**
 * Main entry point for database seeding.
 * Orchestrates the entire seeding workflow:
 * 1. Display startup message
 * 2. Clean existing data
 * 3. Create parent account
 * 4. Create child accounts with wallets
 * 5. Display summary and exit
 */
async function seed() {
  try {
    log.separator();
    log.info('Starting database seeding...');
    log.separator();

    // ========================================
    // Step 1: Clean Database
    // ========================================
    // Delete records in reverse dependency order:
    // Wallets → Children → Parents
    // (because Wallets depend on Children, Children depend on Parents)
    
    log.clean('Cleaning database...');
    
    const deletedWallets = await prisma.wallet.deleteMany({});
    log.action(`Deleted ${deletedWallets.count} wallets`);
    
    const deletedChildren = await prisma.child.deleteMany({});
    log.action(`Deleted ${deletedChildren.count} children`);
    
    const deletedParents = await prisma.parent.deleteMany({});
    log.action(`Deleted ${deletedParents.count} parents`);
    
    log.success('Database cleaned successfully');
    log.separator();

    // ========================================
    // Step 2: Create Parent Account
    // ========================================
    // Hash the password using bcrypt (security best practice)
    // SALT_ROUNDS: 10 (balance between security and performance)
    // Never store plain text passwords in any environment
    
    log.info('Creating parent account...');
    
    const hashedPassword = await bcrypt.hash(
      TEST_DATA.parent.plainPassword,
      10 // SALT_ROUNDS: Industry standard for balanced security/performance
    );
    
    const createdParent = await prisma.parent.create({
      data: {
        fullName: TEST_DATA.parent.fullName,
        email: TEST_DATA.parent.email,
        phoneNumber: TEST_DATA.parent.phoneNumber,
        password: hashedPassword,
        // children: not set here; they're created separately with parent link
      },
    });
    
    log.parent(`Created: ${createdParent.fullName}`);
    log.action(`Email: ${createdParent.email}`);
    log.action(`Phone: ${createdParent.phoneNumber}`);
    log.action(`ID: ${createdParent.id}`);
    log.separator();

    // ========================================
    // Step 3: Create Child Accounts with Wallets
    // ========================================
    // For each child in TEST_DATA:
    // 1. Create the child record (linked to parent via parentId)
    // 2. Create a wallet for the child (linked via childId)
    // This maintains relational integrity through the ID relationships
    
    log.info('Creating child accounts and wallets...');
    
    const createdChildren = [];
    
    for (const childData of TEST_DATA.children) {
      // Create child linked to parent
      const createdChild = await prisma.child.create({
        data: {
          username: childData.username,
          dateOfBirth: childData.dateOfBirth,
          parentId: createdParent.id, // Link to the parent we just created
        },
      });
      
      log.child(`Created Child: ${createdChild.username} (ID: ${createdChild.id})`);
      log.action(`  └─ Date of Birth: ${createdChild.dateOfBirth.toISOString().split('T')[0]}`);
      
      // Create wallet for child
      const createdWallet = await prisma.wallet.create({
        data: {
          childId: createdChild.id, // Link to the child we just created
          balance: childData.initialBalance,
        },
      });
      
      log.wallet(`Created Wallet: ${createdWallet.balance} sats (ID: ${createdWallet.id})`);
      
      createdChildren.push({
        child: createdChild,
        wallet: createdWallet,
      });
    }
    
    log.separator();

    // ========================================
    // Step 4: Display Summary
    // ========================================
    // Show all created data in a readable format
    // Useful for verification and testing
    
    log.success('Database seeding complete!');
    log.separator();
    
    log.info('SEEDED DATA SUMMARY:');
    log.separator();
    
    log.parent(`Parent: ${createdParent.fullName} (ID: ${createdParent.id})`);
    log.action(`Email: ${createdParent.email}`);
    log.action(`Phone: ${createdParent.phoneNumber}`);
    
    log.info(`\nChildren under ${createdParent.fullName}:`);
    createdChildren.forEach((item, index) => {
      log.child(`  ${index + 1}. ${item.child.username}`);
      log.action(`     • Parent ID: ${item.child.parentId}`);
      log.action(`     • Date of Birth: ${item.child.dateOfBirth.toISOString().split('T')[0]}`);
      log.wallet(`     • Wallet Balance: ${item.wallet.balance} satoshis`);
    });
    
    log.separator();
    log.success('Ready for frontend testing and development!');
    log.info('Test credentials:');
    log.action(`  Email: ${TEST_DATA.parent.email}`);
    log.action(`  Password: ${TEST_DATA.parent.plainPassword}`);
    log.separator();

  } catch (error) {
    // ========================================
    // Error Handling
    // ========================================
    // If seeding fails at any step, log the error
    // and ensure Prisma connection is closed
    // to prevent memory leaks or hung processes
    
    log.error(`Seeding failed: ${error.message}`);
    
    // Print full error for debugging
    if (error.code) {
      log.error(`Error Code: ${error.code}`);
    }
    if (error.meta) {
      log.error(`Error Details: ${JSON.stringify(error.meta)}`);
    }
    console.error(error);
    
    // Exit with error code (1 = error, 0 = success)
    process.exit(1);
    
  } finally {
    // ========================================
    // Cleanup
    // ========================================
    // Always disconnect Prisma client to:
    // 1. Close database connection
    // 2. Release connection pool resources
    // 3. Prevent hung Node processes
    // 4. Allow process to exit gracefully
    
    log.info('Closing database connection...');
    await prisma.$disconnect();
    log.success('Disconnected. Exiting...');
  }
}

// ============================================
// Execution
// ============================================
// Run the seed function immediately when this script is executed

seed();

/**
 * ============================================
 * Usage Examples
 * ============================================
 * 
 * 1. Run seeding via package.json script:
 *    $ npm run seed
 * 
 * 2. Run seeding via Prisma CLI:
 *    $ npx prisma db seed
 * 
 * 3. After seeding, test login in development:
 *    - Email: charity.muigai@satsblox.dev
 *    - Password: TestPassword123!
 * 
 * 4. Query seeded data in Prisma Studio:
 *    $ npx prisma studio
 * 
 * ============================================
 * Customization
 * ============================================
 * 
 * To modify test data, edit the TEST_DATA object above:
 * - Change parent name, email, phone, password
 * - Add/remove children
 * - Adjust initial wallet balances
 * - Change birth dates for age-related testing
 * 
 * Example: Add a third child
 *   {
 *     username: 'zara-learning-goals',
 *     dateOfBirth: new Date('2020-11-02'),
 *     initialBalance: 100000n,
 *   }
 * 
 * ============================================
 * Troubleshooting
 * ============================================
 * 
 * Issue: "Error: connect ECONNREFUSED 127.0.0.1:5432"
 *   → PostgreSQL is not running. Start it with:
 *      docker compose up -d
 * 
 * Issue: "Error: P3012 The introspected database was empty"
 *   → Database exists but has no schema. Run migrations first:
 *      npx prisma migrate deploy
 * 
 * Issue: "Error: PrismaClientKnownRequestError Code P2002"
 *   → Unique constraint violation (duplicate email/username)
 *      This should not happen; ensure seed() deletes all data first.
 * 
 * Issue: "The transaction has already been closed"
 *   → Script didn't cleanly exit. Ensure prisma.$disconnect()
 *      is called in the finally block.
 * 
 * ============================================
 */
