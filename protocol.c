#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>

#define MAX_FRAMES 10
#define TIMEOUT_LIMIT 3
#define ACK_LOSS_PROB 25   // 25% chance ACK is lost
#define FRAME_LOSS_PROB 20 // 20% chance Frame is lost

typedef struct {
    int frame_id;
    char data[50];
    int sent;
    int acked;
    int retransmissions;
} Frame;

typedef struct {
    int event_id;
    char type[30];      // FRAME_SENT, ACK_RECEIVED, ACK_LOST, FRAME_LOST, TIMEOUT, RETRANSMIT, SUCCESS
    int frame_id;
    char message[200];
    int is_error;       // 1 = error/loss, 0 = normal
    int is_retransmit;  // 1 = retransmission
} Event;

Event events[200];
int event_count = 0;
int total_frames;
int error_probability;

void add_event(const char* type, int frame_id, const char* message, int is_error, int is_retransmit) {
    Event e;
    e.event_id = event_count + 1;
    strncpy(e.type, type, sizeof(e.type) - 1);
    e.frame_id = frame_id;
    strncpy(e.message, message, sizeof(e.message) - 1);
    e.is_error = is_error;
    e.is_retransmit = is_retransmit;
    events[event_count++] = e;
}

int random_loss(int probability) {
    return (rand() % 100) < probability;
}

void simulate_stop_and_wait(Frame frames[], int n, FILE* log_file, FILE* json_file) {
    char msg[200];

    fprintf(log_file, "=== Stop-and-Wait Protocol Simulation ===\n");
    fprintf(log_file, "Total Frames: %d\n\n", n);

    for (int i = 0; i < n; i++) {
        int acked = 0;
        int attempts = 0;

        while (!acked) {
            attempts++;

            // --- Frame Transmission ---
            if (attempts == 1) {
                snprintf(msg, sizeof(msg), "Frame %d sent → [Data: %s]", frames[i].frame_id, frames[i].data);
            } else {
                snprintf(msg, sizeof(msg), "Frame %d retransmitted → [Data: %s] (Attempt %d)", frames[i].frame_id, frames[i].data, attempts);
            }

            fprintf(log_file, "[TX]  %s\n", msg);
            add_event(attempts == 1 ? "FRAME_SENT" : "RETRANSMIT",
                      frames[i].frame_id, msg,
                      0, attempts > 1);

            // --- Frame Loss Simulation ---
            if (random_loss(error_probability)) {
                snprintf(msg, sizeof(msg), "Frame %d lost in transit!", frames[i].frame_id);
                fprintf(log_file, "[ERR] %s\n", msg);
                add_event("FRAME_LOST", frames[i].frame_id, msg, 1, 0);

                snprintf(msg, sizeof(msg), "Timeout! No ACK received for Frame %d. Retransmitting...", frames[i].frame_id);
                fprintf(log_file, "[TMO] %s\n", msg);
                add_event("TIMEOUT", frames[i].frame_id, msg, 1, 0);
                frames[i].retransmissions++;
                continue;
            }

            // --- ACK Loss Simulation ---
            if (random_loss(error_probability / 2)) {
                snprintf(msg, sizeof(msg), "ACK %d lost in transit!", frames[i].frame_id);
                fprintf(log_file, "[ERR] %s\n", msg);
                add_event("ACK_LOST", frames[i].frame_id, msg, 1, 0);

                snprintf(msg, sizeof(msg), "Timeout! ACK not received for Frame %d. Retransmitting...", frames[i].frame_id);
                fprintf(log_file, "[TMO] %s\n", msg);
                add_event("TIMEOUT", frames[i].frame_id, msg, 1, 0);
                frames[i].retransmissions++;
                continue;
            }

            // --- ACK Received Successfully ---
            snprintf(msg, sizeof(msg), "ACK %d received ✓ — Frame %d acknowledged successfully", frames[i].frame_id, frames[i].frame_id);
            fprintf(log_file, "[ACK] %s\n\n", msg);
            add_event("ACK_RECEIVED", frames[i].frame_id, msg, 0, 0);

            frames[i].acked = 1;
            acked = 1;
        }

        snprintf(msg, sizeof(msg), "Frame %d delivered successfully after %d attempt(s)", frames[i].frame_id, attempts);
        fprintf(log_file, "[OK]  %s\n\n", msg);
        add_event("SUCCESS", frames[i].frame_id, msg, 0, 0);
    }

    fprintf(log_file, "=== Simulation Complete ===\n");
    fprintf(log_file, "Total Events: %d\n", event_count);

    // --- Write JSON Output ---
    fprintf(json_file, "{\n");
    fprintf(json_file, "  \"total_frames\": %d,\n", n);
    fprintf(json_file, "  \"error_probability\": %d,\n", error_probability);
    fprintf(json_file, "  \"total_events\": %d,\n", event_count);
    fprintf(json_file, "  \"events\": [\n");

    for (int i = 0; i < event_count; i++) {
        fprintf(json_file, "    {\n");
        fprintf(json_file, "      \"id\": %d,\n", events[i].event_id);
        fprintf(json_file, "      \"type\": \"%s\",\n", events[i].type);
        fprintf(json_file, "      \"frame_id\": %d,\n", events[i].frame_id);
        fprintf(json_file, "      \"message\": \"%s\",\n", events[i].message);
        fprintf(json_file, "      \"is_error\": %d,\n", events[i].is_error);
        fprintf(json_file, "      \"is_retransmit\": %d\n", events[i].is_retransmit);
        fprintf(json_file, "    }%s\n", (i < event_count - 1) ? "," : "");
    }

    fprintf(json_file, "  ]\n");
    fprintf(json_file, "}\n");
}

int main(int argc, char* argv[]) {
    srand((unsigned int)time(NULL));

    total_frames = 4;
    error_probability = 30;

    if (argc >= 2) total_frames = atoi(argv[1]);
    if (argc >= 3) error_probability = atoi(argv[2]);

    if (total_frames < 1 || total_frames > MAX_FRAMES) {
        printf("Error: Frames must be between 1 and %d\n", MAX_FRAMES);
        return 1;
    }
    if (error_probability < 0 || error_probability > 80) {
        printf("Error: Error probability must be between 0 and 80\n");
        return 1;
    }

    Frame frames[MAX_FRAMES];
    char data_samples[][50] = {
        "Hello World", "Data Packet", "Network Msg",
        "Frame Data", "Test Payload", "ACK Request",
        "Ping Pong", "Info Block", "Stream Chunk", "Final Frame"
    };

    for (int i = 0; i < total_frames; i++) {
        frames[i].frame_id = i + 1;
        strncpy(frames[i].data, data_samples[i % 10], 49);
        frames[i].sent = 0;
        frames[i].acked = 0;
        frames[i].retransmissions = 0;
    }

    FILE* log_file = fopen("output.txt", "w");
    FILE* json_file = fopen("output.json", "w");

    if (!log_file || !json_file) {
        printf("Error: Cannot open output files\n");
        return 1;
    }

    simulate_stop_and_wait(frames, total_frames, log_file, json_file);

    fclose(log_file);
    fclose(json_file);

    printf("Simulation complete. Check output.txt and output.json\n");
    printf("Total events generated: %d\n", event_count);

    return 0;
}