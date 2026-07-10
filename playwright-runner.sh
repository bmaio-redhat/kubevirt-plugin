#!/bin/bash
# KubeVirt Plugin Playwright Test Runner
# Shell script replacement for Makefile functionality
# Provides convenient commands for Playwright test execution and management

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to display help
show_help() {
    echo -e "${GREEN}KubeVirt Plugin Playwright Test Runner${NC}"
    echo ""
    echo -e "${YELLOW}Usage:${NC} $0 <command> [options]"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  test                     Run all Playwright tests"
    echo "  test-gating              Run gating tests (project: Gating)"
    echo "  test-tier1               Run tier1 tests (project: Tier 1)"
    echo "  test-tier2               Run tier2 tests (project: Tier 2)"
    echo "  test-migrations          Run migration tests (project: Migrations)"
    echo "  test-tag <tag>           Run tests matching a tag (e.g., @tier1, @filter)"
    echo "  test-nonpriv             Run non-priv suite — tier 1 scope (project: Non-Priv, NON_PRIV=1)"
    echo "  test-nonpriv-t2          Run tier2 @nonpriv tests as non-priv user (NON_PRIV=1)"
    echo "  test-nonpriv-api         Run non-priv API tests (project: Non-Priv API, NON_PRIV=1)"
    echo "  test-api                 Run privileged API tests browserlessly (project: API Tests)"
    echo "  test-settings            Run CNV settings tests (tag: @cnv-settings; defaults to 1 worker)"
    echo "  test-ui                  Run tests with UI mode (interactive)"
    echo "  test-debug               Run tests with debug mode"
    echo "  test-file <file>         Run a specific test file"
    echo "  clean-results            Clean all test results and reports"
    echo "  show-report              Generate and view Allure report"
    echo "  help                     Show this help message"
    echo ""
    echo -e "${YELLOW}Tag Filtering:${NC}"
    echo "  $0 test-gating                        # Run gating tests"
    echo "  $0 test-tier1                         # Run tier1 tests"
    echo "  $0 test-tier1 --workers=4             # Same with 4 workers"
    echo "  $0 test-tier2                         # Run tier2 tests"
    echo "  $0 test-tier2 --workers=3             # Same with 3 workers"
    echo "  $0 test-migrations                    # Run migration tests"
    echo "  $0 test-tag @filter                   # Run tests with @filter tag"
    echo "  $0 test-tag '@tier1|@filter'          # Run tests with either tag (OR)"
    echo "  $0 test-nonpriv                        # Run non-priv suite (tier 1 scope)"
    echo "  $0 test-nonpriv-t2                     # Run T2 @nonpriv tests as non-priv user"
    echo "  $0 test-nonpriv-api                   # Run non-priv API project (NON_PRIV=1)"
    echo "  $0 test-api                           # Run privileged API tests (browserless)"
    echo "  $0 test-settings                      # Run CNV settings tests (1 worker default)"
    echo "  $0 test-settings --workers=2          # Same with 2 workers"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  $0 test                                                  # Run all tests"
    echo "  $0 test-tag @tier1                                       # Run @tier1 tagged tests"
    echo "  $0 test-ui                                               # Interactive UI mode"
    echo "  $0 test-debug                                            # Debug mode"
    echo "  $0 test-file virtual-machines.spec.ts                    # Specific test file"
    echo ""
    echo "  # Utilities"
    echo "  $0 clean-results                                         # Clean all test results"
    echo "  $0 show-report                                           # Generate and view Allure report"
}

# Detect console and API URLs from the live cluster and export them as the
# highest-priority env vars (WEB_CONSOLE_URL, CLUSTER_URL).
#
# Priority order for each URL:
#   1. Explicit env var already set by the caller (WEB_CONSOLE_URL / CLUSTER_URL)
#   2. BRIDGE_BASE_ADDRESS (set by Jenkinsfile for backward compat)
#   3. Discovered from the live cluster via `oc`
#   4. Constructed from CLUSTER_NAME + CLUSTER_DOMAIN (last resort, known to be
#      wrong on BYO clusters where CLUSTER_DOMAIN is a registration domain, not
#      the real infrastructure domain — e.g. s390x clusters)
#
# By discovering the URLs via `oc` we avoid the mismatch between CLUSTER_DOMAIN
# (e.g. byo.cnv-qe.rhood.us) and the real infrastructure domain
# (e.g. s390g.lab.eng.rdu2.redhat.com) that occurs on BYO/s390x clusters.
detect_urls() {
    # Load .env first so CLUSTER_NAME/CLUSTER_DOMAIN/WEB_CONSOLE_URL values from it
    # take priority over whatever oc is currently logged into. This prevents the
    # common mistake of oc being logged into a different cluster than .env targets.
    local dot_env_file="${SCRIPT_DIR}/.env"
    if [[ -f "$dot_env_file" ]]; then
        # Only load values not already set in the shell environment (dotenv semantics).
        while IFS='=' read -r key value; do
            # Skip comments and blank lines
            [[ "$key" =~ ^[[:space:]]*# ]] && continue
            [[ -z "$key" ]] && continue
            key="${key// /}"
            # Strip surrounding quotes from value if present
            value="${value#\"}" ; value="${value%\"}"
            value="${value#\'}" ; value="${value%\'}"
            # Only export if not already in environment
            if [[ -z "${!key+x}" ]]; then
                export "$key=$value"
            fi
        done < "$dot_env_file"
    fi

    # --- Console URL ---
    if [[ -n "${WEB_CONSOLE_URL:-}" ]]; then
        echo "WEB_CONSOLE_URL: ${WEB_CONSOLE_URL} (from .env or env)"
    elif [[ -n "${BRIDGE_BASE_ADDRESS:-}" ]]; then
        export WEB_CONSOLE_URL="${BRIDGE_BASE_ADDRESS}"
        echo "WEB_CONSOLE_URL: ${WEB_CONSOLE_URL} (from BRIDGE_BASE_ADDRESS)"
    elif [[ -n "${CLUSTER_NAME:-}" && -n "${CLUSTER_DOMAIN:-}" ]]; then
        # .env has CLUSTER_NAME+CLUSTER_DOMAIN but no WEB_CONSOLE_URL.
        # Try to discover the real console URL via oc (handles BYO/s390x clusters
        # where CLUSTER_DOMAIN is a registration domain, not the infra domain).
        local discovered_console
        discovered_console=$(
            oc get consoles.config.openshift.io cluster \
                -o jsonpath='{.status.consoleURL}' 2>/dev/null || true
        )
        # Only use the discovered URL if it belongs to the same cluster as .env.
        if [[ -n "$discovered_console" && "$discovered_console" == *"${CLUSTER_NAME}"* ]]; then
            export WEB_CONSOLE_URL="${discovered_console}"
            echo "WEB_CONSOLE_URL: ${WEB_CONSOLE_URL} (discovered via oc — matches CLUSTER_NAME)"
        else
            export WEB_CONSOLE_URL="https://console-openshift-console.apps.${CLUSTER_NAME}.${CLUSTER_DOMAIN}/"
            echo "WEB_CONSOLE_URL: ${WEB_CONSOLE_URL} (constructed from CLUSTER_NAME+CLUSTER_DOMAIN)"
            if [[ -n "$discovered_console" && "$discovered_console" != *"${CLUSTER_NAME}"* ]]; then
                echo "  NOTE: oc is logged into a different cluster (${discovered_console}) — ignoring it."
                echo "        Run 'oc login' against ${CLUSTER_NAME} or set WEB_CONSOLE_URL explicitly."
            fi
        fi
    else
        # No .env cluster identity at all — fall back to oc discovery.
        local discovered_console
        discovered_console=$(
            oc get consoles.config.openshift.io cluster \
                -o jsonpath='{.status.consoleURL}' 2>/dev/null || true
        )
        if [[ -n "$discovered_console" ]]; then
            export WEB_CONSOLE_URL="${discovered_console}"
            echo "WEB_CONSOLE_URL: ${WEB_CONSOLE_URL} (discovered via oc — no .env cluster identity)"
        else
            echo "WARNING: Could not determine WEB_CONSOLE_URL — using env-variables.ts default"
        fi
    fi

    # --- API URL ---
    if [[ -n "${CLUSTER_URL:-}" ]]; then
        echo "CLUSTER_URL: ${CLUSTER_URL} (from .env or env)"
    elif [[ -n "${OPENSHIFT_CLUSTER_URL:-}" ]]; then
        export CLUSTER_URL="${OPENSHIFT_CLUSTER_URL}"
        echo "CLUSTER_URL: ${CLUSTER_URL} (from OPENSHIFT_CLUSTER_URL)"
    else
        # Derive from the console URL we just resolved — more reliable than
        # CLUSTER_NAME+CLUSTER_DOMAIN on BYO/s390x clusters.
        local console_url="${WEB_CONSOLE_URL:-}"
        if [[ -n "$console_url" ]]; then
            local infra_domain
            infra_domain=$(echo "$console_url" | \
                sed -n 's|.*console-openshift-console\.apps\.\([^/]*\).*|\1|p')
            if [[ -n "$infra_domain" ]]; then
                export CLUSTER_URL="https://api.${infra_domain}:6443"
                echo "CLUSTER_URL: ${CLUSTER_URL} (derived from WEB_CONSOLE_URL)"
            fi
        fi

        # Final fallback: ask oc directly for the server URL
        if [[ -z "${CLUSTER_URL:-}" ]]; then
            local discovered_api
            discovered_api=$(
                oc whoami --show-server 2>/dev/null || true
            )
            if [[ -n "$discovered_api" ]]; then
                export CLUSTER_URL="${discovered_api}"
                echo "CLUSTER_URL: ${CLUSTER_URL} (discovered via oc whoami --show-server)"
            elif [[ -n "${CLUSTER_NAME:-}" && -n "${CLUSTER_DOMAIN:-}" ]]; then
                export CLUSTER_URL="https://api.${CLUSTER_NAME}.${CLUSTER_DOMAIN}:6443"
                echo "CLUSTER_URL: ${CLUSTER_URL} (constructed from CLUSTER_NAME+CLUSTER_DOMAIN)"
            else
                echo "WARNING: Could not determine CLUSTER_URL — using env-variables.ts default"
            fi
        fi
    fi
}

# Detect NNCP NIC and export NNCP_NIC for tests that read process.env.NNCP_NIC.
detect_nic() {
    echo -e "${GREEN}Setting Playwright env (NNCP_NIC)...${NC}"

    local ARCH
    # Honour an explicit ARCH env var (e.g. set by CI or the user) first.
    # Also honour ARCH values loaded from .env by detect_urls() earlier.
    if [[ -n "${ARCH:-}" ]]; then
        echo "Cluster Arch: ${ARCH} (from env/ARCH)"
    else
        # Only query oc if it appears to be logged into the same cluster as .env.
        # Compare the oc server URL against CLUSTER_URL (exported by detect_urls).
        local oc_server
        oc_server=$(oc whoami --show-server 2>/dev/null || true)
        local target_cluster="${CLUSTER_URL:-}"

        if [[ -n "$oc_server" && -n "$target_cluster" && "$oc_server" != "$target_cluster" ]]; then
            echo "  NOTE: oc is logged into ${oc_server} but CLUSTER_URL is ${target_cluster}."
            echo "        Skipping oc-based arch detection — defaulting to amd64."
            echo "        Run 'oc login' against the correct cluster or set ARCH= explicitly."
            ARCH="amd64"
        else
            # With set -e, failed oc in $(...) would abort the script; keep detection optional.
            ARCH=$(
                oc get nodes -l node-role.kubernetes.io/control-plane \
                    -o jsonpath='{.items[0].metadata.labels.kubernetes\.io/arch}' 2>/dev/null || true
            )
            if [[ -z "$ARCH" ]]; then
                ARCH=$(
                    oc get nodes -l node-role.kubernetes.io/master \
                        -o jsonpath='{.items[0].metadata.labels.kubernetes\.io/arch}' 2>/dev/null || true
                )
            fi
            ARCH="${ARCH:-amd64}"
        fi
        echo "Cluster Arch: $ARCH (CLUSTER)"
    fi

    local cpumanager_label
    if [[ "$ARCH" != "s390x" ]]; then
        cpumanager_label="-l cpumanager=true"
    else
        cpumanager_label=""
    fi
    # echo "cpumanager_label: $cpumanager_label"

    local first_node
    first_node=$(oc get node ${cpumanager_label} 2>/dev/null | awk 'NR==2 {print $1}' || true)
    # echo "first_node: $first_node"

    if oc get node 2>/dev/null | grep -q "lab.eng.rdu2.redhat.com"; then
        echo "eno4 detected"
        export NNCP_NIC=eno4
    fi
 
    if [[ -n "$first_node" ]]; then
        local nns_yaml
        nns_yaml=$(oc get NodeNetworkState "$first_node" -o yaml 2>/dev/null || true)

        if [ -n "$(echo "$nns_yaml" | grep ens10)" ]; then
            echo "ens10 detected"
            export NNCP_NIC=ens10
        fi

        if [ -n "$(echo "$nns_yaml" | grep enp10s0)" ]; then
            echo "enp10s0 detected"
            export NNCP_NIC=enp10s0
        fi

        if [ -n "$(echo "$nns_yaml" | grep enc1100)" ]; then
            echo "enc1100 detected"
            export NNCP_NIC=enc1100
        fi
    fi

    echo "NNCP_NIC: ${NNCP_NIC:-} (CLUSTER)"
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${GREEN}Checking prerequisites...${NC}"
    
    # Check if in correct directory
    if [ ! -f "package.json" ]; then
        echo -e "${RED}Error: Must be run from project root directory${NC}"
        exit 1
    fi
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Warning: node_modules not found${NC}"
        echo "Run: npm install"
        exit 1
    fi

    detect_urls
    detect_nic
    
    echo -e "${GREEN}Prerequisites check passed${NC}"
}

# Function to run tests
run_tests() {
    check_prerequisites

    echo -e "${GREEN}Running Playwright tests...${NC}"
    npm run test-playwright -- "$@"
}

# Function to run tests with UI mode
run_tests_ui() {
    check_prerequisites
    
    echo -e "${GREEN}Running Playwright tests in UI mode...${NC}"
    npm run test-playwright-ui -- "$@"
}

# Function to run tests in debug mode
run_tests_debug() {
    check_prerequisites
    
    echo -e "${GREEN}Running Playwright tests in debug mode...${NC}"
    npm run test-playwright-debug -- "$@"
}

# Function to run tests with specific tag expression
# Supports single tags (@tier1) and complex expressions ('@tier1|@filter').
# Extra args (e.g. --workers=3) are passed through.
run_test_tag() {
    local tag="$1"
    shift
    if [ -z "$tag" ]; then
        echo -e "${RED}Error: Please specify a tag${NC}"
        echo "Usage: $0 test-tag <tag> [options]"
        echo "       $0 test-tag '@tier1|@filter' --workers=3"
        exit 1
    fi

    check_prerequisites

    echo -e "${GREEN}Running tests with tag: $tag${NC}"
    npm run test-playwright -- --grep "$tag" "$@"
}

# Run gating tests (project: Gating).
# Pass through extra args (e.g. --workers=3).
run_test_gating() {
    check_prerequisites

    echo -e "${GREEN}Running gating tests [Gating]${NC}"
    npm run test-playwright -- --project="Gating" "$@"
}

# Run tier1 tests (project: Tier 1).
# Pass through extra args (e.g. --workers=4).
run_test_tier1() {
    check_prerequisites

    echo -e "${GREEN}Running tier1 tests [Tier 1]${NC}"
    npm run test-playwright -- --project="Tier 1" "$@"
}

# Run tier2 tests (project: Tier 2).
# Pass through extra args (e.g. --workers=3).
run_test_tier2() {
    check_prerequisites

    echo -e "${GREEN}Running tier2 tests [Tier 2]${NC}"
    npm run test-playwright -- --project="Tier 2" "$@"
}

# Run migration tests (project: Migrations).
# Pass through extra args (e.g. --workers=2).
run_test_migrations() {
    check_prerequisites

    echo -e "${GREEN}Running migration tests [Migrations]${NC}"
    npm run test-playwright -- --project="Migrations" "$@"
}

# Run the non-priv test suite — tier 1 scope (project: Non-Priv, NON_PRIV=1).
# Tests validate permission boundaries — what non-priv users can see, do, and cannot do.
# Sets NON_PRIV=1 so the framework provisions the test user and logs in as non-priv.
# Pass through extra args (e.g. --workers=3).
run_test_nonpriv() {
    export NON_PRIV=1
    check_prerequisites

    echo -e "${GREEN}Running non-priv tests [Non-Priv project, NON_PRIV=1]${NC}"
    npm run test-playwright -- --project="Non-Priv" "$@"
}

# Run tier2 @nonpriv tests as a non-privileged user (project: Tier 2, NON_PRIV=1).
# Sets NON_PRIV=1 so the framework provisions the test user, logs in as non-priv,
# and auto-skips @adminOnly tests. Only @nonpriv tagged tests will run.
# Pass through extra args (e.g. --workers=3).
run_test_nonpriv_t2() {
    export NON_PRIV=1
    check_prerequisites

    echo -e "${GREEN}Running tier2 @nonpriv tests [Tier 2, NON_PRIV=1]${NC}"
    npm run test-playwright -- --project="Tier 2" --grep "@nonpriv" "$@"
}

# Run non-priv API tests browserlessly (project: Non-Priv API, NON_PRIV=1).
# Tests validate API contract from the non-priv user perspective.
# Pass through extra args (e.g. --workers=4).
run_test_nonpriv_api() {
    export NON_PRIV=1
    check_prerequisites

    echo -e "${GREEN}Running non-priv API tests [Non-Priv API project, NON_PRIV=1]${NC}"
    SKIP_BROWSER_SETUP=1 npm run test-playwright -- --project="Non-Priv API" "$@"
}

# Run privileged API tests browserlessly (project: API Tests).
# No browser setup required — tests use RequestContextClient with admin credentials.
# Pass through extra args (e.g. --workers=4, specific spec file).
run_test_api() {
    check_prerequisites

    echo -e "${GREEN}Running privileged API tests [SKIP_BROWSER_SETUP=1]${NC}"
    SKIP_BROWSER_SETUP=1 npm run test-playwright -- --project="API Tests" "$@"
}

# Run the CNV settings test group (tagged @cnv-settings).
# Defaults to 1 worker since settings tests are few, but parallelism is safe.
# Pass through extra args (e.g. --workers=2).
run_test_settings() {
    check_prerequisites

    echo -e "${GREEN}Running CNV settings tests [@cnv-settings]${NC}"
    npm run test-playwright -- --grep "@cnv-settings" --workers="${SETTINGS_WORKERS:-1}" "$@"
}

# Function to run a specific test file
run_test_file() {
    if [ -z "$1" ]; then
        echo -e "${RED}Error: Please specify a test file${NC}"
        echo "Usage: $0 test-file <filename> [additional-flags]"
        exit 1
    fi
    
    check_prerequisites
    
    local test_file="$1"
    shift
    echo -e "${GREEN}Running test file: $test_file${NC}"
    npm run test-playwright -- "playwright/tests/$test_file" "$@"
}

# Function to clean test results
clean_test_results() {
    echo -e "${GREEN}Cleaning test results...${NC}"
    
    # Remove test result directories
    rm -rf allure-results
    rm -rf allure-report
    rm -rf playwright/allure-results
    rm -rf playwright/allure-report
    rm -rf playwright/playwright-report
    rm -rf playwright/test-results
    rm -rf playwright/.test-config*.json
    rm -rf playwright/playwright/.test-config*.json
    rm -rf .test-config*.json
    
    echo -e "${GREEN}Test results cleaned${NC}"
}

# Function to show report
show_report() {
    echo -e "${GREEN}Generating and opening Allure report...${NC}"
    
    # Check if allure-results exists
    if [ ! -d "allure-results" ]; then
        echo -e "${RED}Error: allure-results directory not found${NC}"
        echo "Run tests first to generate results"
        exit 1
    fi
    
    # Generate report
    echo -e "${YELLOW}Generating Allure report...${NC}"
    npx allure generate allure-results --clean -o allure-report
    
    # Open report
    echo -e "${YELLOW}Opening Allure report...${NC}"
    npx allure open allure-report
}

# Main script logic
main() {
    # Check if command is provided
    if [ $# -eq 0 ]; then
        show_help
        exit 0
    fi
    
    local command="$1"
    shift
    
    case "$command" in
        test)
            run_tests "$@"
            ;;
        test-tag)
            run_test_tag "$@"
            ;;
        test-gating)
            run_test_gating "$@"
            ;;
        test-tier1)
            run_test_tier1 "$@"
            ;;
        test-tier2)
            run_test_tier2 "$@"
            ;;
        test-migrations)
            run_test_migrations "$@"
            ;;
        test-nonpriv)
            run_test_nonpriv "$@"
            ;;
        test-nonpriv-t2)
            run_test_nonpriv_t2 "$@"
            ;;
        test-nonpriv-api)
            run_test_nonpriv_api "$@"
            ;;
        test-api)
            run_test_api "$@"
            ;;
        test-settings)
            run_test_settings "$@"
            ;;
        test-ui)
            run_tests_ui "$@"
            ;;
        test-debug)
            run_tests_debug "$@"
            ;;
        test-file)
            run_test_file "$@"
            ;;
        clean-results)
            clean_test_results
            ;;
        show-report)
            show_report
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
